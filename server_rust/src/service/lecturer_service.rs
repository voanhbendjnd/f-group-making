use calamine::{Reader, Xlsx};
use chrono::Utc;
use regex::Regex;
use sqlx::MySqlPool;
use std::collections::HashMap;

use std::io::Cursor;
use std::sync::LazyLock;

use crate::domain::AuthoritiesConstants;
use crate::dto::auth::BatchActivationResultDTO;
use crate::dto::lecturer::{CreateLecturerDTO, LecturerDTO};
use crate::dto::student::{ImportResultDTO, ImportRowErrorDTO};
use crate::dto::ResultPaginationDTO;
use crate::error::{AppError, Violation};
use crate::repository::lecturer_repository::LecturerRepository;
use crate::repository::user_repository::UserRepository;
use crate::service::mail_service::MailService;
use crate::service::term_service::TermService;
use crate::service::user_service::UserService;

static EMAIL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$").expect("valid regex")
});

pub struct LecturerService;

impl LecturerService {
    pub async fn create_lecturer(
        pool: &MySqlPool,
        request: CreateLecturerDTO,
    ) -> Result<LecturerDTO, AppError> {
        let code = request.code.trim();
        let email = request.email.trim().to_lowercase();

        let mut violations = Vec::new();

        if code.is_empty() || code.len() < 2 || code.len() > 50 {
            violations.push(Violation {
                field: "code".to_string(),
                message: "lecturerCreate.invalid.code".to_string(),
            });
        }

        if email.is_empty() || email.len() > 254 || !EMAIL_REGEX.is_match(&email) {
            violations.push(Violation {
                field: "email".to_string(),
                message: "lecturerCreate.invalid.email".to_string(),
            });
        }

        if !violations.is_empty() {
            return Err(AppError::Validation(violations));
        }

        if LecturerRepository::exists_by_code_ignore_case(pool, code).await? {
            violations.push(Violation {
                field: "code".to_string(),
                message: "lecturerCreate.duplicateCode".to_string(),
            });
        }

        if UserRepository::find_by_email(pool, &email).await?.is_some() {
            violations.push(Violation {
                field: "email".to_string(),
                message: "lecturerCreate.duplicateEmail".to_string(),
            });
        }

        if !violations.is_empty() {
            let duplicates_only = violations
                .iter()
                .all(|v| v.message.starts_with("lecturerCreate.duplicate"));
            if duplicates_only {
                return Err(AppError::Conflict {
                    message: "Lecturer duplicate code or email".to_string(),
                    entity_name: "lecturer".to_string(),
                    error_key: "duplicate".to_string(),
                    detail: Some(
                        violations
                            .iter()
                            .map(|v| v.message.clone())
                            .collect::<Vec<_>>()
                            .join(", "),
                    ),
                });
            } else {
                return Err(AppError::Validation(violations));
            }
        }

        // Insert user
        let user_res = sqlx::query(
            "INSERT INTO users (email, name, activated, created_date, last_modified_date) VALUES (?, ?, 0, NOW(), NOW())",
        )
        .bind(&email)
        .bind(code)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to insert user for lecturer: {e}")))?;

        let user_id = user_res.last_insert_id() as i64;
        UserRepository::add_authority(pool, user_id, AuthoritiesConstants::LECTURE).await?;

        LecturerRepository::create(pool, user_id, code).await?;

        Ok(LecturerDTO {
            user_id,
            code: code.to_string(),
            name: Some(code.to_string()),
            email,
            activated: false,
            has_activation_key: false,
            activation_key_expires_at: None,
            is_key_expired: false,
            created_date: Some(Utc::now()),
            last_modified_date: Some(Utc::now()),
        })
    }

    pub async fn get_lecturers(
        pool: &MySqlPool,
        search: Option<String>,
        activated: Option<bool>,
        has_activation_key: Option<bool>,
        page: i64,
        size: i64,
        term_id: Option<i32>,
    ) -> Result<ResultPaginationDTO<LecturerDTO>, AppError> {
        TermService::validate_term(pool, term_id).await?;

        let (dtos, total) = LecturerRepository::search_lecturers(
            pool,
            search.as_deref(),
            activated,
            has_activation_key,
            term_id,
            page,
            size,
        )
        .await?;

        Ok(ResultPaginationDTO::new(dtos, total, page, size))
    }

    pub async fn activate_all_matching(
        pool: &MySqlPool,
        mail_service: &MailService,
        search: Option<String>,
        term_id: Option<i32>,
    ) -> Result<BatchActivationResultDTO, AppError> {
        TermService::validate_term(pool, term_id).await?;

        let user_ids =
            LecturerRepository::find_matching_user_ids(pool, search.as_deref(), term_id).await?;

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

    pub async fn delete_lecturer(pool: &MySqlPool, user_id: i64) -> Result<(), AppError> {
        if user_id <= 0 {
            return Err(AppError::bad_request(
                "Lecturer ID must not be null",
                "lecturerManagement",
                "idnull",
            ));
        }

        let _ = LecturerRepository::find_by_id(pool, user_id)
            .await?
            .ok_or_else(|| {
                AppError::bad_request(
                    format!("Lecturer not found with ID: {}", user_id),
                    "lecturerManagement",
                    "notfound",
                )
            })?;

        LecturerRepository::delete(pool, user_id).await?;

        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to delete user {user_id}: {e}")))?;

        Ok(())
    }

    pub async fn delete_lecturers_batch(
        pool: &MySqlPool,
        user_ids: &[i64],
        term_id: Option<i32>,
    ) -> Result<(), AppError> {
        TermService::validate_user_ids_in_term(pool, user_ids, term_id).await?;
        if user_ids.is_empty() {
            return Ok(());
        }

        let mut distinct_ids = user_ids.to_vec();
        distinct_ids.sort_unstable();
        distinct_ids.dedup();

        if let Some(tid) = term_id {
            let matching_ids =
                TermService::validate_user_ids_in_term(pool, &distinct_ids, Some(tid)).await;
            if matching_ids.is_err() {
                return Err(AppError::bad_request(
                    "One or more lecturers do not belong to the selected term",
                    "lecturerManagement",
                    "lecturerOutsideTerm",
                ));
            }
        }

        LecturerRepository::delete_batch(pool, &distinct_ids).await?;

        let placeholders = distinct_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM users WHERE id IN ({})", placeholders);
        let mut query = sqlx::query(&sql);
        for id in &distinct_ids {
            query = query.bind(id);
        }
        query
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to batch delete users: {e}")))?;

        Ok(())
    }

    pub async fn import_from_excel(
        pool: &MySqlPool,
        bytes: &[u8],
    ) -> Result<ImportResultDTO, AppError> {
        if bytes.is_empty() {
            return Err(AppError::bad_request(
                "File must not be empty.",
                "lecturerManagement",
                "emptyfile",
            ));
        }

        let cursor = Cursor::new(bytes);
        let mut workbook = Xlsx::new(cursor).map_err(|e| {
            AppError::bad_request(
                format!("Cannot read Excel file: {e}"),
                "lecturerManagement",
                "excelerror",
            )
        })?;

        let sheet_names = workbook.sheet_names();
        let target_sheet_name = sheet_names
            .iter()
            .find(|n| {
                let lower = n.to_lowercase();
                lower.contains("mentor")
                    || lower.contains("giang vien")
                    || lower.contains("giảng viên")
                    || lower.contains("lecturer")
            })
            .or_else(|| {
                if sheet_names.len() >= 2 {
                    Some(&sheet_names[1])
                } else {
                    sheet_names.first()
                }
            })
            .ok_or_else(|| {
                AppError::bad_request(
                    "Cannot find lecturer or mentor sheet in the Excel file.",
                    "lecturerManagement",
                    "nosheet",
                )
            })?
            .clone();

        let range = workbook.worksheet_range(&target_sheet_name).map_err(|e| {
            AppError::bad_request(
                format!("Failed to read sheet '{target_sheet_name}': {e}"),
                "lecturerManagement",
                "excelerror",
            )
        })?;

        let mut rows = Vec::new();
        let mut col_code = None;
        let mut col_email = None;

        for (r_idx, row) in range.rows().enumerate() {
            if r_idx == 0 {
                for (c_idx, cell) in row.iter().enumerate() {
                    let val = cell.to_string().trim().to_lowercase();
                    if (val.contains("mentor")
                        || val.contains("gv")
                        || val.contains("lecturer")
                        || val.contains("code")
                        || val.contains("mã"))
                        && !val.contains("group")
                    {
                        col_code = Some(c_idx);
                    } else if val.contains("email") || val.contains("mail") {
                        col_email = Some(c_idx);
                    }
                }

                if col_code.is_none() && row.len() >= 2 {
                    col_code = Some(1);
                }
                if col_email.is_none() && row.len() >= 3 {
                    col_email = Some(2);
                }
                continue;
            }

            let c_code = col_code.unwrap_or(1);
            let c_email = col_email.unwrap_or(2);

            let code = row
                .get(c_code)
                .map(|c| c.to_string().trim().to_string())
                .unwrap_or_default();
            let email = row
                .get(c_email)
                .map(|c| c.to_string().trim().to_lowercase())
                .unwrap_or_default();

            if code.is_empty() && email.is_empty() {
                continue;
            }

            rows.push((r_idx + 1, code, email));
        }

        if rows.is_empty() {
            return Err(AppError::bad_request(
                "Excel file contains no lecturer data.",
                "lecturerManagement",
                "nodata",
            ));
        }

        // Validate rows
        let mut errors = Vec::new();
        let mut seen_codes: HashMap<String, usize> = HashMap::new();
        let mut seen_emails: HashMap<String, usize> = HashMap::new();

        for (row_num, code, email) in &rows {
            if code.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: *row_num,
                    roll_number: None,
                    field: "code".to_string(),
                    message: "Lecturer / Mentor code must not be empty.".to_string(),
                });
            } else if code.len() < 2 || code.len() > 50 {
                errors.push(ImportRowErrorDTO {
                    row: *row_num,
                    roll_number: None,
                    field: "code".to_string(),
                    message: "Lecturer / Mentor code must be between 2 and 50 characters."
                        .to_string(),
                });
            } else {
                let norm = code.to_lowercase();
                if let Some(prev) = seen_codes.get(&norm) {
                    errors.push(ImportRowErrorDTO {
                        row: *row_num,
                        roll_number: None,
                        field: "code".to_string(),
                        message: format!("Lecturer code '{code}' is duplicated in file (already appeared at row {prev})."),
                    });
                } else {
                    seen_codes.insert(norm.clone(), *row_num);
                    if LecturerRepository::exists_by_code_ignore_case(pool, code).await? {
                        errors.push(ImportRowErrorDTO {
                            row: *row_num,
                            roll_number: None,
                            field: "code".to_string(),
                            message: format!(
                                "Lecturer code '{code}' already exists in the system."
                            ),
                        });
                    }
                }
            }

            if email.is_empty() {
                errors.push(ImportRowErrorDTO {
                    row: *row_num,
                    roll_number: None,
                    field: "email".to_string(),
                    message: "Email must not be empty.".to_string(),
                });
            } else if email.len() > 254 || !EMAIL_REGEX.is_match(email) {
                errors.push(ImportRowErrorDTO {
                    row: *row_num,
                    roll_number: None,
                    field: "email".to_string(),
                    message: "A valid email of at most 254 characters is required.".to_string(),
                });
            } else if let Some(prev) = seen_emails.get(email) {
                errors.push(ImportRowErrorDTO {
                    row: *row_num,
                    roll_number: None,
                    field: "email".to_string(),
                    message: format!(
                        "Email '{email}' is duplicated in file (already appeared at row {prev})."
                    ),
                });
            } else {
                seen_emails.insert(email.clone(), *row_num);
                if UserRepository::find_by_email(pool, email).await?.is_some() {
                    errors.push(ImportRowErrorDTO {
                        row: *row_num,
                        roll_number: None,
                        field: "email".to_string(),
                        message: format!("Email '{email}' already exists in the system."),
                    });
                }
            }
        }

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

        // Save all rows
        for (_, code, email) in rows.iter() {
            let res = sqlx::query(
                "INSERT INTO users (email, name, activated, created_date, last_modified_date) VALUES (?, ?, 0, NOW(), NOW())",
            )
            .bind(email)
            .bind(code)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save imported user: {e}")))?;

            let uid = res.last_insert_id() as i64;
            UserRepository::add_authority(pool, uid, AuthoritiesConstants::LECTURE).await?;
            LecturerRepository::create(pool, uid, code).await?;
        }

        Ok(ImportResultDTO {
            success: true,
            total_imported: rows.len(),
            errors: Vec::new(),
            confirmation_required: false,
            new_major_codes: Vec::new(),
            created_major_codes: Vec::new(),
        })
    }
}
