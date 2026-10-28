use calamine::{Data, Reader, Xlsx};
use chrono::Utc;
use regex::Regex;
use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::LazyLock;

use crate::domain::AuthoritiesConstants;
use crate::dto::auth::BatchActivationResultDTO;
use crate::dto::student::{CreateStudentDTO, ImportResultDTO, ImportRowErrorDTO, StudentDTO};
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::lecturer_repository::LecturerRepository;
use crate::repository::major_repository::MajorRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::repository::term_repository::TermRepository;
use crate::repository::user_repository::UserRepository;
use crate::service::mail_service::MailService;
use crate::service::term_service::TermService;
use crate::service::user_service::UserService;
use crate::util::major_code;

static EMAIL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$").expect("valid regex")
});

const MAX_FILE_SIZE_BYTES: usize = 5 * 1024 * 1024; // 5 MB

const COL_ROLL_NUMBER: usize = 1;
const COL_FULL_NAME: usize = 2;
const COL_MAJOR: usize = 3;
const COL_MEMBER_CODE: usize = 4;
const COL_EMAIL: usize = 5;
const COL_SLOT_TYPE: usize = 6;
const COL_GROUP_NAME: usize = 8;
const COL_LECTURER_CODE: usize = 9;

#[derive(Debug, Clone)]
struct StudentImportRow {
    row_index: usize,
    roll_number: String,
    full_name: String,
    original_major: String,
    major_code: Option<String>,
    member_code: String,
    email: String,
    slot_type: String,
    group_name: String,
    lecturer_code: String,
}

pub struct StudentService;

impl StudentService {
    pub async fn create_student(
        pool: &MySqlPool,
        request: CreateStudentDTO,
    ) -> Result<StudentDTO, AppError> {
        TermService::validate_term(pool, Some(request.term_id)).await?;

        let major = MajorRepository::find_by_id(pool, request.major_id)
            .await?
            .ok_or_else(|| Self::create_error("majorId"))?;

        if !major_code::is_valid(&major.code) {
            return Err(Self::create_error("majorId"));
        }

        let school_class =
            SchoolClassRepository::find_by_id_for_update(pool, request.school_class_id)
                .await?
                .ok_or_else(|| Self::create_error("schoolClassId"))?;

        if school_class.term_id != Some(request.term_id) {
            return Err(Self::create_error("schoolClassId"));
        }

        let lecturer_id = school_class
            .lecturer_id
            .ok_or_else(|| Self::create_error("lecturer"))?;

        let lecturer = LecturerRepository::find_by_id(pool, lecturer_id)
            .await?
            .ok_or_else(|| Self::create_error("lecturer"))?;

        if UserRepository::find_by_id(pool, lecturer.user_id)
            .await?
            .is_none()
        {
            return Err(Self::create_error("lecturer"));
        }

        let full_name = request.full_name.trim();
        let roll_number = request.roll_number.trim();
        let member_code = request.member_code.trim();
        let email = request.email.trim().to_lowercase();

        if full_name.is_empty() || full_name.len() > 50 {
            return Err(Self::create_error("fullName"));
        }

        if roll_number.is_empty() || roll_number.len() > 255 {
            return Err(Self::create_error("rollNumber"));
        }

        if member_code.is_empty() || member_code.len() > 255 {
            return Err(Self::create_error("memberCode"));
        }

        if email.is_empty() || email.len() > 254 || !EMAIL_REGEX.is_match(&email) {
            return Err(Self::create_error("email"));
        }

        if StudentRepository::exists_by_roll_number(pool, roll_number).await? {
            return Err(Self::create_error("rollNumber"));
        }

        if StudentRepository::exists_by_member_code(pool, member_code).await? {
            return Err(Self::create_error("memberCode"));
        }

        if UserRepository::find_by_email(pool, &email).await?.is_some() {
            return Err(Self::create_error("email"));
        }

        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to begin transaction for student creation: {e}"
            ))
        })?;

        let user_res = sqlx::query(
            "INSERT INTO users (email, name, activated, created_date, last_modified_date) VALUES (?, ?, 0, NOW(), NOW())",
        )
        .bind(&email)
        .bind(full_name)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to insert user for student: {e}")))?;

        let user_id = user_res.last_insert_id() as i64;

        sqlx::query("INSERT IGNORE INTO user_authority (user_id, authority_name) VALUES (?, ?)")
            .bind(user_id)
            .bind(AuthoritiesConstants::STUDENT)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert authority: {e}")))?;

        sqlx::query(
            r#"INSERT INTO students (user_id, roll_number, full_name, member_code, cohort, slot_type, major_id, school_class_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(user_id)
        .bind(roll_number)
        .bind(full_name)
        .bind(member_code)
        .bind(&major.code)
        .bind(Option::<String>::None)
        .bind(major.id)
        .bind(school_class.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to insert student: {e}")))?;

        tx.commit().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to commit student creation transaction: {e}"
            ))
        })?;

        let mut created = Self::get_student_by_user_id(pool, user_id).await?;
        created.school_class_id = Some(school_class.id);
        Ok(created)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn get_students(
        pool: &MySqlPool,
        search: Option<String>,
        major_search: Option<String>,
        major_id: Option<i32>,
        activated: Option<bool>,
        has_activation_key: Option<bool>,
        page: i64,
        size: i64,
        term_id: Option<i32>,
    ) -> Result<ResultPaginationDTO<StudentDTO>, AppError> {
        TermService::validate_term(pool, term_id).await?;

        let (students, total) = StudentRepository::search_students(
            pool,
            search.as_deref(),
            major_search.as_deref(),
            major_id,
            activated,
            has_activation_key,
            term_id,
            None,
            page,
            size,
        )
        .await?;

        Ok(ResultPaginationDTO::new(students, total, page, size))
    }

    pub async fn get_student_by_user_id(
        pool: &MySqlPool,
        user_id: i64,
    ) -> Result<StudentDTO, AppError> {
        StudentRepository::find_student_projection_by_id(pool, user_id)
            .await?
            .ok_or_else(|| {
                AppError::bad_request(
                    format!("Student not found with ID: {user_id}"),
                    "studentManagement",
                    "studentnotfound",
                )
            })
    }

    pub async fn activate_all_matching(
        pool: &MySqlPool,
        mail_service: &MailService,
        search: Option<String>,
        major_search: Option<String>,
        major_id: Option<i32>,
        term_id: Option<i32>,
    ) -> Result<BatchActivationResultDTO, AppError> {
        TermService::validate_term(pool, term_id).await?;

        let user_ids = StudentRepository::find_matching_user_ids(
            pool,
            search.as_deref(),
            major_search.as_deref(),
            major_id,
            term_id,
            None,
        )
        .await?;

        if user_ids.is_empty() {
            return Ok(BatchActivationResultDTO {
                total_requested: 0,
                total_processed: 0,
                total_skipped_already_active: 0,
                sent_emails: Vec::new(),
            });
        }

        let users_to_activate = UserService::init_activate_key_mul_account(pool, &user_ids).await?;
        for user in &users_to_activate {
            mail_service.send_activation_email(user).await;
        }

        Ok(BatchActivationResultDTO {
            total_requested: user_ids.len(),
            total_processed: users_to_activate.len(),
            total_skipped_already_active: user_ids.len().saturating_sub(users_to_activate.len()),
            sent_emails: users_to_activate.into_iter().map(|u| u.email).collect(),
        })
    }

    #[allow(clippy::map_entry)]
    pub async fn import_from_excel(
        pool: &MySqlPool,
        bytes: &[u8],
        term_id: Option<i32>,
        confirmed_major_codes: Option<HashSet<String>>,
    ) -> Result<ImportResultDTO, AppError> {
        if bytes.is_empty() {
            return Err(AppError::bad_request(
                "File must not be empty.",
                "student",
                "excel.invalid",
            ));
        }
        if bytes.len() > MAX_FILE_SIZE_BYTES {
            return Err(AppError::bad_request(
                "File size exceeds 5MB limit.",
                "student",
                "excel.invalid",
            ));
        }

        let effective_term_id = match term_id {
            Some(tid) => {
                if TermRepository::find_by_id(pool, tid).await?.is_none() {
                    return Err(AppError::bad_request(
                        format!("Học kỳ (Term) không tồn tại với ID: {tid}"),
                        "studentManagement",
                        "termNotFound",
                    ));
                }
                tid
            }
            None => TermService::ensure_current_term(pool).await?.id,
        };

        let cursor = Cursor::new(bytes);
        let mut workbook = Xlsx::new(cursor).map_err(|e| {
            AppError::bad_request(
                format!("Cannot read Excel file: {e}"),
                "student",
                "excel.invalid",
            )
        })?;

        let sheet_names = workbook.sheet_names();
        let sheet_name = sheet_names
            .first()
            .ok_or_else(|| {
                AppError::bad_request(
                    "Cannot read Excel file: No sheets found.",
                    "student",
                    "excel.invalid",
                )
            })?
            .clone();

        let range = workbook.worksheet_range(&sheet_name).map_err(|e| {
            AppError::bad_request(
                format!("Cannot read worksheet: {e}"),
                "student",
                "excel.invalid",
            )
        })?;

        let mut rows = Vec::new();

        for (r_idx, row) in range.rows().enumerate() {
            // Header row 0 and title row 1 skipped
            if r_idx < 2 {
                continue;
            }

            if Self::is_row_empty(row) {
                continue;
            }

            let roll_number = Self::get_cell_string(row, COL_ROLL_NUMBER);
            let full_name = Self::get_cell_string(row, COL_FULL_NAME);
            let original_major = Self::get_cell_string(row, COL_MAJOR);
            let member_code = Self::get_cell_string(row, COL_MEMBER_CODE);
            let email = Self::get_cell_string(row, COL_EMAIL).to_lowercase();
            let major_code = Self::parse_major_code(&original_major);
            let slot_type = Self::get_cell_string(row, COL_SLOT_TYPE);
            let group_name = Self::get_cell_string(row, COL_GROUP_NAME);
            let lecturer_code = Self::get_cell_string(row, COL_LECTURER_CODE);

            rows.push(StudentImportRow {
                row_index: r_idx + 1,
                roll_number,
                full_name,
                original_major,
                major_code,
                member_code,
                email,
                slot_type,
                group_name,
                lecturer_code,
            });
        }

        if rows.is_empty() {
            return Err(AppError::bad_request(
                "Excel file contains no student data.",
                "student",
                "excel.invalid",
            ));
        }

        // Fetch catalog of majors
        let catalog = MajorRepository::find_all(pool).await?;
        let majors_by_code: HashMap<String, crate::domain::Major> = catalog
            .into_iter()
            .map(|m| (major_code::normalize(&m.code), m))
            .collect();

        // Fetch lecturers present in file
        let lecturer_codes_in_file: Vec<String> = rows
            .iter()
            .map(|r| r.lecturer_code.trim().to_uppercase())
            .filter(|c| !c.is_empty())
            .collect();

        let lecturer_list =
            LecturerRepository::find_by_code_ignore_case_in(pool, &lecturer_codes_in_file).await?;
        let lecturers_by_code: HashMap<String, crate::domain::Lecturer> = lecturer_list
            .into_iter()
            .map(|l| (l.code.trim().to_uppercase(), l))
            .collect();

        // Validate rows
        let mut errors = Self::validate_rows(pool, &rows, &lecturers_by_code).await?;

        // Check if temporary name collision with existing majors
        let existing_names: HashSet<String> = majors_by_code
            .values()
            .map(|m| m.name.trim().to_uppercase())
            .collect();

        for row in &rows {
            if let Some(ref mc) = row.major_code {
                if !majors_by_code.contains_key(mc) && existing_names.contains(mc) {
                    errors.push(ImportRowErrorDTO {
                        row: row.row_index,
                        roll_number: Some(row.roll_number.clone()),
                        field: "majorCode".to_string(),
                        message: format!(
                            "Cannot use code as the temporary name because a major already has that name: {mc}"
                        ),
                    });
                }
            }
        }

        // All-or-nothing
        if !errors.is_empty() {
            return Ok(ImportResultDTO {
                success: false,
                total_imported: 0,
                errors,
                confirmation_required: false,
                new_major_codes: Vec::new(),
                created_major_codes: Vec::new(),
            });
        }

        // Check for new major codes
        let mut new_major_codes: Vec<String> = rows
            .iter()
            .filter_map(|r| r.major_code.clone())
            .filter(|code| !majors_by_code.contains_key(code))
            .collect();
        new_major_codes.sort();
        new_major_codes.dedup();

        let approved_codes: HashSet<String> = confirmed_major_codes
            .unwrap_or_default()
            .into_iter()
            .map(|c| major_code::normalize(&c))
            .collect();

        if !new_major_codes.iter().all(|c| approved_codes.contains(c)) {
            return Ok(ImportResultDTO {
                success: false,
                total_imported: 0,
                errors: Vec::new(),
                confirmation_required: true,
                new_major_codes,
                created_major_codes: Vec::new(),
            });
        }

        // Begin transaction
        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to begin transaction for student import: {e}"
            ))
        })?;

        // Create approved new majors
        let mut final_majors_by_code = majors_by_code;
        for code in &new_major_codes {
            let res = sqlx::query(
                "INSERT INTO majors (code, name, created_date, last_modified_date) VALUES (?, ?, NOW(), NOW())",
            )
            .bind(code)
            .bind(code)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert new major: {e}")))?;

            let id = res.last_insert_id() as i32;
            final_majors_by_code.insert(
                code.clone(),
                crate::domain::Major {
                    id,
                    code: code.clone(),
                    name: code.clone(),
                    created_by: None,
                    created_date: Some(Utc::now()),
                    last_modified_by: None,
                    last_modified_date: Some(Utc::now()),
                },
            );
        }

        // Find or create school classes
        let mut school_classes_by_key: HashMap<String, i32> = HashMap::new();
        for row in &rows {
            let group_name = row.group_name.trim();
            let class_key = group_name.to_uppercase();
            if !school_classes_by_key.contains_key(&class_key) {
                let norm_lec = row.lecturer_code.trim().to_uppercase();
                let lecturer_id = lecturers_by_code.get(&norm_lec).map(|l| l.user_id);

                let existing_class = sqlx::query_as::<_, crate::domain::SchoolClass>(
                    "SELECT * FROM school_classes WHERE LOWER(name) = LOWER(?) AND term_id = ? FOR UPDATE",
                )
                .bind(group_name)
                .bind(effective_term_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to query school class: {e}")))?;

                let class_id = match existing_class {
                    Some(mut sc) => {
                        if sc.lecturer_id.is_none() && lecturer_id.is_some() {
                            sqlx::query(
                                "UPDATE school_classes SET lecturer_id = ?, last_modified_date = NOW() WHERE id = ?",
                            )
                            .bind(lecturer_id)
                            .bind(sc.id)
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| AppError::Internal(format!("Failed to update class lecturer: {e}")))?;
                            sc.lecturer_id = lecturer_id;
                        }
                        sc.id
                    }
                    None => {
                        let res = sqlx::query(
                            "INSERT INTO school_classes (name, term_id, lecturer_id, created_date, last_modified_date) VALUES (?, ?, ?, NOW(), NOW())",
                        )
                        .bind(group_name)
                        .bind(effective_term_id)
                        .bind(lecturer_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| AppError::Internal(format!("Failed to insert school class: {e}")))?;
                        res.last_insert_id() as i32
                    }
                };

                school_classes_by_key.insert(class_key, class_id);
            }
        }

        // Save users and students
        for row in &rows {
            let major = final_majors_by_code
                .get(row.major_code.as_deref().unwrap_or(""))
                .ok_or_else(|| {
                    AppError::Internal(format!("Major missing for row: {}", row.row_index))
                })?;

            let class_id = school_classes_by_key
                .get(&row.group_name.trim().to_uppercase())
                .copied();

            let user_res = sqlx::query(
                "INSERT INTO users (email, name, activated, created_date, last_modified_date) VALUES (?, ?, 0, NOW(), NOW())",
            )
            .bind(&row.email)
            .bind(&row.full_name)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert user for row {}: {e}", row.row_index)))?;

            let user_id = user_res.last_insert_id() as i64;

            sqlx::query(
                "INSERT IGNORE INTO user_authority (user_id, authority_name) VALUES (?, ?)",
            )
            .bind(user_id)
            .bind(AuthoritiesConstants::STUDENT)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert student authority: {e}")))?;

            sqlx::query(
                r#"INSERT INTO students (user_id, roll_number, full_name, member_code, cohort, slot_type, major_id, school_class_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
            )
            .bind(user_id)
            .bind(&row.roll_number)
            .bind(&row.full_name)
            .bind(&row.member_code)
            .bind(&row.original_major)
            .bind(if row.slot_type.is_empty() { None } else { Some(&row.slot_type) })
            .bind(major.id)
            .bind(class_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert student row {}: {e}", row.row_index)))?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit student import: {e}")))?;

        Ok(ImportResultDTO {
            success: true,
            total_imported: rows.len(),
            errors: Vec::new(),
            confirmation_required: false,
            new_major_codes: Vec::new(),
            created_major_codes: new_major_codes,
        })
    }

    async fn validate_rows(
        pool: &MySqlPool,
        rows: &[StudentImportRow],
        lecturers_by_code: &HashMap<String, crate::domain::Lecturer>,
    ) -> Result<Vec<ImportRowErrorDTO>, AppError> {
        let mut errors = Vec::new();

        let roll_numbers_in_file: Vec<String> = rows
            .iter()
            .map(|r| r.roll_number.clone())
            .filter(|r| !r.is_empty())
            .collect();
        let member_codes_in_file: Vec<String> = rows
            .iter()
            .map(|r| r.member_code.clone())
            .filter(|m| !m.is_empty())
            .collect();
        let emails_in_file: Vec<String> = rows
            .iter()
            .map(|r| r.email.clone())
            .filter(|e| !e.is_empty())
            .collect();

        let existing_roll_numbers =
            StudentRepository::find_existing_roll_numbers(pool, &roll_numbers_in_file).await?;
        let existing_member_codes =
            StudentRepository::find_existing_member_codes(pool, &member_codes_in_file).await?;
        let existing_emails = UserRepository::find_existing_emails(pool, &emails_in_file).await?;

        let mut seen_roll_numbers: HashMap<String, usize> = HashMap::new();
        let mut seen_member_codes: HashMap<String, usize> = HashMap::new();
        let mut seen_emails: HashMap<String, usize> = HashMap::new();
        let mut class_to_lecturer_in_file: HashMap<String, String> = HashMap::new();

        for row in rows {
            // Rule 1: rollNumber must not be empty
            if row.roll_number.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: None,
                    field: "rollNumber".to_string(),
                    message: "Student roll number must not be empty.".to_string(),
                });
                continue;
            }

            // Rule 2a: rollNumber duplicate within file
            let roll_lower = row.roll_number.to_lowercase();
            if let Some(prev) = seen_roll_numbers.get(&roll_lower) {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "rollNumber".to_string(),
                    message: format!(
                        "Roll number '{}' is duplicated in file (already appeared at row {prev}).",
                        row.roll_number
                    ),
                });
            } else {
                seen_roll_numbers.insert(roll_lower.clone(), row.row_index);
            }

            // Rule 2b: memberCode duplicate within file
            if !row.member_code.is_empty() {
                let member_lower = row.member_code.to_lowercase();
                if let Some(prev) = seen_member_codes.get(&member_lower) {
                    errors.push(ImportRowErrorDTO {
                        row: row.row_index,
                        roll_number: Some(row.roll_number.clone()),
                        field: "memberCode".to_string(),
                        message: format!(
                            "Member code '{}' is duplicated in file (already appeared at row {prev}).",
                            row.member_code
                        ),
                    });
                } else {
                    seen_member_codes.insert(member_lower.clone(), row.row_index);
                }
            }

            // Rule 2c: email duplicate within file
            if !row.email.is_empty() {
                if let Some(prev) = seen_emails.get(&row.email) {
                    errors.push(ImportRowErrorDTO {
                        row: row.row_index,
                        roll_number: Some(row.roll_number.clone()),
                        field: "email".to_string(),
                        message: format!(
                            "Email '{}' is duplicated in file (already appeared at row {prev}).",
                            row.email
                        ),
                    });
                } else {
                    seen_emails.insert(row.email.clone(), row.row_index);
                }
            }

            // Rule 3: duplicate check against DB
            if existing_roll_numbers.contains(&roll_lower) {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "rollNumber".to_string(),
                    message: format!(
                        "Roll number '{}' already exists in the system.",
                        row.roll_number
                    ),
                });
            }
            if !row.member_code.is_empty()
                && existing_member_codes.contains(&row.member_code.to_lowercase())
            {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "memberCode".to_string(),
                    message: format!(
                        "Member code '{}' already exists in the system.",
                        row.member_code
                    ),
                });
            }
            if existing_emails.contains(&row.email) {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "email".to_string(),
                    message: format!("Email '{}' already exists in the system.", row.email),
                });
            }

            // Rule 4: fullName must not be empty
            if row.full_name.is_empty() || row.full_name.len() > 50 {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "fullName".to_string(),
                    message: "Student full name must contain between 1 and 50 characters."
                        .to_string(),
                });
            }

            // Rule 5: originalMajor must not be empty
            if row.original_major.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "originalMajor".to_string(),
                    message: "Major information must not be empty.".to_string(),
                });
                continue;
            }

            // Rule 6: originalMajor format
            if row.major_code.is_none() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "originalMajor".to_string(),
                    message: format!(
                        "Major format '{}' is invalid. Required format: PREFIX_MAJORCODE_... (e.g. BEN_CHN_ET_19C).",
                        row.original_major
                    ),
                });
                continue;
            }

            if row.original_major.len() > 255 {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "originalMajor".to_string(),
                    message: "Cohort must not exceed 255 characters.".to_string(),
                });
            }

            if row.slot_type.len() > 255 {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "slotType".to_string(),
                    message: "SlotType must not exceed 255 characters.".to_string(),
                });
            }

            // Rule 7: member code must not be empty
            if row.member_code.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "memberCode".to_string(),
                    message: "Member code must not be empty.".to_string(),
                });
                continue;
            }

            // Rule 8: email must not be empty / valid
            if row.email.is_empty() || row.email.len() > 254 || !EMAIL_REGEX.is_match(&row.email) {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "email".to_string(),
                    message: "A valid email of at most 254 characters is required.".to_string(),
                });
            }

            // Rule 9: groupName validation
            if row.group_name.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "groupName".to_string(),
                    message: "Group name (tên lớp) không được để trống.".to_string(),
                });
            } else if row.group_name.len() > 50 {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "groupName".to_string(),
                    message: "Group name (tên lớp) không được vượt quá 50 ký tự.".to_string(),
                });
            }

            // Rule 10: lecturerCode validation
            if row.lecturer_code.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: row.row_index,
                    roll_number: Some(row.roll_number.clone()),
                    field: "lecturerCode".to_string(),
                    message: "Mã giảng viên không được để trống.".to_string(),
                });
            } else {
                let norm_lec = row.lecturer_code.trim().to_uppercase();
                if !lecturers_by_code.contains_key(&norm_lec) {
                    errors.push(ImportRowErrorDTO {
                        row: row.row_index,
                        roll_number: Some(row.roll_number.clone()),
                        field: "lecturerCode".to_string(),
                        message: format!(
                            "Giảng viên với mã '{}' không tìm thấy trong hệ thống.",
                            row.lecturer_code
                        ),
                    });
                }
            }

            // Rule 11: consistent lecturer per groupName within file
            if !row.group_name.is_empty() && !row.lecturer_code.is_empty() {
                let class_key = row.group_name.trim().to_uppercase();
                let current_lec = row.lecturer_code.trim().to_uppercase();
                if let Some(existing_lec) = class_to_lecturer_in_file.get(&class_key) {
                    if !existing_lec.eq_ignore_ascii_case(&current_lec) {
                        errors.push(ImportRowErrorDTO {
                            row: row.row_index,
                            roll_number: Some(row.roll_number.clone()),
                            field: "groupName".to_string(),
                            message: format!(
                                "Lớp '{}' có nhiều mã giảng viên khác nhau trong cùng file ('{}' và '{}').",
                                row.group_name, existing_lec, row.lecturer_code
                            ),
                        });
                    }
                } else {
                    class_to_lecturer_in_file.insert(class_key, current_lec);
                }
            }
        }

        Ok(errors)
    }

    fn parse_major_code(original_major: &str) -> Option<String> {
        let trimmed = original_major.trim();
        if trimmed.is_empty() {
            return None;
        }
        let tokens: Vec<&str> = trimmed.split('_').collect();
        if tokens.len() < 2 || tokens[1].trim().is_empty() {
            return None;
        }
        let code = major_code::normalize(tokens[1]);
        if major_code::is_valid(&code) {
            Some(code)
        } else {
            None
        }
    }

    fn get_cell_string(row: &[Data], col_idx: usize) -> String {
        match row.get(col_idx) {
            Some(Data::String(s)) => s.trim().to_string(),
            Some(Data::Float(f)) => {
                if *f == f.floor() {
                    format!("{:.0}", f)
                } else {
                    f.to_string()
                }
            }
            Some(Data::Int(i)) => i.to_string(),
            Some(Data::Bool(b)) => b.to_string(),
            _ => String::new(),
        }
    }

    fn is_row_empty(row: &[Data]) -> bool {
        row.iter().all(|c| match c {
            Data::Empty => true,
            Data::String(s) => s.trim().is_empty(),
            _ => false,
        })
    }

    fn create_error(field: &str) -> AppError {
        AppError::bad_request(
            "Student information is invalid or already exists",
            "studentManagement",
            format!("studentCreate.{field}"),
        )
    }
}
