use chrono::{DateTime, Utc};
use sqlx::{FromRow, MySqlPool};
use std::collections::HashSet;

use crate::domain::Student;
use crate::dto::student::StudentDTO;
use crate::error::AppError;

#[derive(Debug, FromRow)]
pub struct StudentDbRow {
    pub user_id: i64,
    pub roll_number: String,
    pub full_name: String,
    pub email: String,
    pub member_code: Option<String>,
    pub cohort: Option<String>,
    pub slot_type: Option<String>,
    pub major_id: Option<i32>,
    pub major_code: Option<String>,
    pub major_name: Option<String>,
    pub school_class_id: Option<i32>,
    pub group_name: Option<String>,
    pub activated: bool,
    pub activation_key: Option<String>,
    pub activation_key_expires_at: Option<DateTime<Utc>>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_date: Option<DateTime<Utc>>,
    pub lecturer_code: Option<String>,
    pub self_description: Option<String>,
}

impl From<StudentDbRow> for StudentDTO {
    fn from(r: StudentDbRow) -> Self {
        let now = Utc::now();
        let has_key = r.activation_key.is_some();
        let is_key_expired = r
            .activation_key_expires_at
            .map(|exp| exp <= now)
            .unwrap_or(false);

        StudentDTO {
            user_id: r.user_id,
            roll_number: r.roll_number,
            full_name: r.full_name,
            email: r.email,
            member_code: r.member_code,
            cohort: r.cohort,
            slot_type: r.slot_type,
            major_id: r.major_id,
            major_code: r.major_code,
            major_name: r.major_name,
            school_class_id: r.school_class_id,
            group_name: r.group_name,
            activated: r.activated,
            has_activation_key: has_key,
            activation_key_expires_at: r.activation_key_expires_at,
            is_key_expired,
            created_date: r.created_date,
            last_modified_date: r.last_modified_date,
            lecturer_code: r.lecturer_code,
            self_description: r.self_description,
        }
    }
}

pub struct StudentRepository;

impl StudentRepository {
    pub async fn find_by_id(pool: &MySqlPool, user_id: i64) -> Result<Option<Student>, AppError> {
        let student =
            sqlx::query_as::<_, Student>("SELECT * FROM students WHERE user_id = ? LIMIT 1")
                .bind(user_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in student find_by_id: {e}"))
                })?;

        Ok(student)
    }

    pub async fn find_student_profile(pool: &MySqlPool, user_id: i64) -> Result<Student, AppError> {
        Self::find_by_id(pool, user_id).await?.ok_or_else(|| {
            AppError::not_found("Sinh viên không tồn tại", "student", "studentNotFound")
        })
    }

    pub async fn exists_by_roll_number(
        pool: &MySqlPool,
        roll_number: &str,
    ) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM students WHERE LOWER(roll_number) = LOWER(?)")
                .bind(roll_number.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_roll_number: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn exists_by_member_code(
        pool: &MySqlPool,
        member_code: &str,
    ) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM students WHERE LOWER(member_code) = LOWER(?)")
                .bind(member_code.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_member_code: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn find_existing_roll_numbers(
        pool: &MySqlPool,
        roll_numbers: &[String],
    ) -> Result<HashSet<String>, AppError> {
        if roll_numbers.is_empty() {
            return Ok(HashSet::new());
        }

        let placeholders = roll_numbers
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT LOWER(roll_number) FROM students WHERE LOWER(roll_number) IN ({})",
            placeholders
        );

        let mut query = sqlx::query_scalar::<_, String>(&sql);
        for r in roll_numbers {
            query = query.bind(r.trim().to_lowercase());
        }

        let existing = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in find_existing_roll_numbers: {e}"))
        })?;

        Ok(existing.into_iter().collect())
    }

    pub async fn find_existing_member_codes(
        pool: &MySqlPool,
        member_codes: &[String],
    ) -> Result<HashSet<String>, AppError> {
        if member_codes.is_empty() {
            return Ok(HashSet::new());
        }

        let placeholders = member_codes
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT LOWER(member_code) FROM students WHERE LOWER(member_code) IN ({})",
            placeholders
        );

        let mut query = sqlx::query_scalar::<_, String>(&sql);
        for m in member_codes {
            query = query.bind(m.trim().to_lowercase());
        }

        let existing = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in find_existing_member_codes: {e}"))
        })?;

        Ok(existing.into_iter().collect())
    }

    pub async fn update_bio(
        pool: &MySqlPool,
        user_id: i64,
        bio: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE students SET self_description = ? WHERE user_id = ?")
            .bind(bio)
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in update_bio: {e}")))?;

        Ok(())
    }

    pub async fn count_by_school_class_id(
        pool: &MySqlPool,
        school_class_id: i32,
    ) -> Result<i64, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM students WHERE school_class_id = ?")
                .bind(school_class_id)
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in count_by_school_class_id: {e}"))
                })?;

        Ok(count)
    }

    pub async fn count_distinct_majors_by_school_class_id(
        pool: &MySqlPool,
        school_class_id: i32,
    ) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(DISTINCT major_id) FROM students WHERE school_class_id = ? AND major_id IS NOT NULL",
        )
        .bind(school_class_id)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in count_distinct_majors_by_school_class_id: {e}"
            ))
        })?;

        Ok(count)
    }

    pub async fn count_by_school_class_id_and_major_code(
        pool: &MySqlPool,
        school_class_id: i32,
        major_code: &str,
    ) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*)
               FROM students s
               JOIN majors m ON s.major_id = m.id
               WHERE s.school_class_id = ? AND UPPER(m.code) = UPPER(?)"#,
        )
        .bind(school_class_id)
        .bind(major_code.trim())
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in count_by_school_class_id_and_major_code: {e}"
            ))
        })?;

        Ok(count)
    }

    pub async fn find_students_by_school_class_id(
        pool: &MySqlPool,
        class_id: i32,
    ) -> Result<Vec<StudentDTO>, AppError> {
        let sql = r#"
            SELECT s.user_id, s.roll_number, s.full_name, u.email, s.member_code,
                   s.cohort, s.slot_type, s.major_id, m.code as major_code, m.name as major_name,
                   s.school_class_id,
                   (SELECT g.name FROM `groups` g JOIN group_members gm ON g.id = gm.group_id WHERE gm.student_id = s.user_id LIMIT 1) as group_name,
                   u.activated, u.activation_key, u.activation_key_expires_at,
                   u.created_date, u.last_modified_date,
                   (SELECT l.code FROM lecturers l JOIN school_classes sc ON sc.lecturer_id = l.user_id WHERE sc.id = s.school_class_id LIMIT 1) as lecturer_code,
                   s.self_description
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN majors m ON s.major_id = m.id
            WHERE s.school_class_id = ?
            ORDER BY s.roll_number ASC
        "#;

        let rows = sqlx::query_as::<_, StudentDbRow>(sql)
            .bind(class_id)
            .fetch_all(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Database error in find_students_by_school_class_id: {e}"
                ))
            })?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn find_student_projection_by_id(
        pool: &MySqlPool,
        user_id: i64,
    ) -> Result<Option<StudentDTO>, AppError> {
        let sql = r#"
            SELECT s.user_id, s.roll_number, s.full_name, u.email, s.member_code,
                   s.cohort, s.slot_type, s.major_id, m.code as major_code, m.name as major_name,
                   s.school_class_id,
                   (SELECT g.name FROM `groups` g JOIN group_members gm ON g.id = gm.group_id WHERE gm.student_id = s.user_id LIMIT 1) as group_name,
                   u.activated, u.activation_key, u.activation_key_expires_at,
                   u.created_date, u.last_modified_date,
                   (SELECT l.code FROM lecturers l JOIN school_classes sc ON sc.lecturer_id = l.user_id WHERE sc.id = s.school_class_id LIMIT 1) as lecturer_code,
                   s.self_description
            FROM students s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN majors m ON s.major_id = m.id
            WHERE s.user_id = ?
            LIMIT 1
        "#;

        let row = sqlx::query_as::<_, StudentDbRow>(sql)
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Database error in find_student_projection_by_id: {e}"
                ))
            })?;

        Ok(row.map(Into::into))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_students(
        pool: &MySqlPool,
        search: Option<&str>,
        major_search: Option<&str>,
        major_id: Option<i32>,
        activated: Option<bool>,
        has_activation_key: Option<bool>,
        term_id: Option<i32>,
        school_class_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<StudentDTO>, i64), AppError> {
        let mut where_conditions = Vec::new();
        let mut bindings = Vec::new();

        if let Some(cid) = school_class_id {
            where_conditions.push(format!("s.school_class_id = {}", cid));
        }

        if let Some(mid) = major_id {
            where_conditions.push(format!("s.major_id = {}", mid));
        } else if let Some(ms) = major_search {
            let trimmed = ms.trim();
            if !trimmed.is_empty() {
                let words: Vec<&str> = trimmed.split_whitespace().collect();
                let mut word_conds = Vec::new();
                for word in words {
                    let pattern = format!("%{}%", word.to_lowercase());
                    word_conds.push("(LOWER(m.code) LIKE ? OR LOWER(m.name) LIKE ?)".to_string());
                    bindings.push(pattern.clone());
                    bindings.push(pattern);
                }
                where_conditions.push(format!("({})", word_conds.join(" AND ")));
            }
        }

        if let Some(tid) = term_id {
            where_conditions.push(format!(
                "EXISTS (SELECT 1 FROM school_classes sc WHERE sc.id = s.school_class_id AND sc.term_id = {})",
                tid
            ));
        }

        if let Some(act) = activated {
            where_conditions.push(format!("u.activated = {}", if act { 1 } else { 0 }));
        }

        if let Some(has_key) = has_activation_key {
            if has_key {
                where_conditions.push("(u.activation_key IS NOT NULL AND (u.activation_key_expires_at IS NULL OR u.activation_key_expires_at > NOW()))".to_string());
            } else {
                where_conditions.push("(u.activation_key IS NULL OR (u.activation_key_expires_at IS NOT NULL AND u.activation_key_expires_at <= NOW()))".to_string());
            }
        }

        if let Some(s) = search {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                where_conditions.push(
                    "(LOWER(s.roll_number) LIKE ? OR LOWER(s.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(s.member_code) LIKE ?)".to_string(),
                );
                bindings.push(pattern.clone());
                bindings.push(pattern.clone());
                bindings.push(pattern.clone());
                bindings.push(pattern);
            }
        }

        let where_clause = if where_conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_conditions.join(" AND "))
        };

        let count_sql = format!(
            r#"SELECT COUNT(*)
               FROM students s
               JOIN users u ON s.user_id = u.id
               LEFT JOIN majors m ON s.major_id = m.id
               {}"#,
            where_clause
        );

        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
        for bind in &bindings {
            count_query = count_query.bind(bind);
        }

        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count students: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            r#"SELECT s.user_id, s.roll_number, s.full_name, u.email, s.member_code,
                      s.cohort, s.slot_type, s.major_id, m.code as major_code, m.name as major_name,
                      s.school_class_id,
                      (SELECT g.name FROM `groups` g JOIN group_members gm ON g.id = gm.group_id WHERE gm.student_id = s.user_id LIMIT 1) as group_name,
                      u.activated, u.activation_key, u.activation_key_expires_at,
                      u.created_date, u.last_modified_date,
                      (SELECT l.code FROM lecturers l JOIN school_classes sc ON sc.lecturer_id = l.user_id WHERE sc.id = s.school_class_id LIMIT 1) as lecturer_code,
                      s.self_description
               FROM students s
               JOIN users u ON s.user_id = u.id
               LEFT JOIN majors m ON s.major_id = m.id
               {}
               ORDER BY u.created_date DESC, s.user_id DESC
               LIMIT ? OFFSET ?"#,
            where_clause
        );

        let mut select_query = sqlx::query_as::<_, StudentDbRow>(&select_sql);
        for bind in &bindings {
            select_query = select_query.bind(bind);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select students: {e}")))?;

        Ok((rows.into_iter().map(Into::into).collect(), total))
    }

    pub async fn delete(pool: &MySqlPool, user_id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM students WHERE user_id = ?")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in delete student: {e}")))?;

        Ok(())
    }

    pub async fn delete_batch(pool: &MySqlPool, user_ids: &[i64]) -> Result<(), AppError> {
        if user_ids.is_empty() {
            return Ok(());
        }

        let placeholders = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM students WHERE user_id IN ({})", placeholders);

        let mut query = sqlx::query(&sql);
        for id in user_ids {
            query = query.bind(id);
        }

        query.execute(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in delete_batch students: {e}"))
        })?;

        Ok(())
    }

    pub async fn find_matching_user_ids(
        pool: &MySqlPool,
        search: Option<&str>,
        major_search: Option<&str>,
        major_id: Option<i32>,
        term_id: Option<i32>,
        school_class_id: Option<i32>,
    ) -> Result<Vec<i64>, AppError> {
        let mut where_conditions = vec!["u.activated = 0".to_string()];
        let mut bindings = Vec::new();

        if let Some(cid) = school_class_id {
            where_conditions.push(format!("s.school_class_id = {}", cid));
        }

        if let Some(mid) = major_id {
            where_conditions.push(format!("s.major_id = {}", mid));
        } else if let Some(ms) = major_search {
            let trimmed = ms.trim();
            if !trimmed.is_empty() {
                let words: Vec<&str> = trimmed.split_whitespace().collect();
                let mut word_conds = Vec::new();
                for word in words {
                    let pattern = format!("%{}%", word.to_lowercase());
                    word_conds.push("(LOWER(m.code) LIKE ? OR LOWER(m.name) LIKE ?)".to_string());
                    bindings.push(pattern.clone());
                    bindings.push(pattern);
                }
                where_conditions.push(format!("({})", word_conds.join(" AND ")));
            }
        }

        if let Some(tid) = term_id {
            where_conditions.push(format!(
                "EXISTS (SELECT 1 FROM school_classes sc WHERE sc.id = s.school_class_id AND sc.term_id = {})",
                tid
            ));
        }

        if let Some(s) = search {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                where_conditions.push(
                    "(LOWER(s.roll_number) LIKE ? OR LOWER(s.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(s.member_code) LIKE ?)".to_string(),
                );
                bindings.push(pattern.clone());
                bindings.push(pattern.clone());
                bindings.push(pattern.clone());
                bindings.push(pattern);
            }
        }

        let sql = format!(
            r#"SELECT DISTINCT s.user_id
               FROM students s
               JOIN users u ON s.user_id = u.id
               LEFT JOIN majors m ON s.major_id = m.id
               WHERE {}"#,
            where_conditions.join(" AND ")
        );

        let mut query = sqlx::query_scalar::<_, i64>(&sql);
        for bind in &bindings {
            query = query.bind(bind);
        }

        let ids = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!(
                "Database error in student find_matching_user_ids: {e}"
            ))
        })?;

        Ok(ids)
    }
}
