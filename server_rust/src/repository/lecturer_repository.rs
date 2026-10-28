use chrono::{DateTime, Utc};
use sqlx::MySqlPool;

use crate::domain::Lecturer;
use crate::dto::lecturer::LecturerDTO;
use crate::error::AppError;

pub struct LecturerRepository;

impl LecturerRepository {
    pub async fn find_by_id(pool: &MySqlPool, user_id: i64) -> Result<Option<Lecturer>, AppError> {
        let lecturer =
            sqlx::query_as::<_, Lecturer>("SELECT * FROM lecturers WHERE user_id = ? LIMIT 1")
                .bind(user_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Database error in find_by_id: {e}")))?;

        Ok(lecturer)
    }

    pub async fn exists_by_id(pool: &MySqlPool, user_id: i64) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lecturers WHERE user_id = ?")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in exists_by_id: {e}")))?;

        Ok(count > 0)
    }

    pub async fn exists_by_code_ignore_case(
        pool: &MySqlPool,
        code: &str,
    ) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM lecturers WHERE LOWER(code) = LOWER(?)")
                .bind(code.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_code_ignore_case: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn find_by_code_ignore_case(
        pool: &MySqlPool,
        code: &str,
    ) -> Result<Option<Lecturer>, AppError> {
        let lecturer = sqlx::query_as::<_, Lecturer>(
            "SELECT * FROM lecturers WHERE LOWER(code) = LOWER(?) LIMIT 1",
        )
        .bind(code.trim())
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Database error in find_by_code_ignore_case: {e}"))
        })?;

        Ok(lecturer)
    }

    pub async fn find_by_code_ignore_case_in(
        pool: &MySqlPool,
        codes: &[String],
    ) -> Result<Vec<Lecturer>, AppError> {
        if codes.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = codes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query_str = format!(
            "SELECT * FROM lecturers WHERE LOWER(code) IN ({})",
            placeholders
        );

        let mut query = sqlx::query_as::<_, Lecturer>(&query_str);
        for code in codes {
            query = query.bind(code.trim().to_lowercase());
        }

        let list = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_by_code_ignore_case_in: {e}"
            ))
        })?;

        Ok(list)
    }

    pub async fn create(pool: &MySqlPool, user_id: i64, code: &str) -> Result<Lecturer, AppError> {
        sqlx::query("INSERT INTO lecturers (user_id, code) VALUES (?, ?)")
            .bind(user_id)
            .bind(code.trim())
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in create lecturer: {e}")))?;

        Ok(Lecturer {
            user_id,
            code: code.trim().to_string(),
        })
    }

    pub async fn delete(pool: &MySqlPool, user_id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM lecturers WHERE user_id = ?")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in delete lecturer: {e}")))?;

        Ok(())
    }

    pub async fn delete_batch(pool: &MySqlPool, user_ids: &[i64]) -> Result<(), AppError> {
        if user_ids.is_empty() {
            return Ok(());
        }

        let placeholders = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM lecturers WHERE user_id IN ({})", placeholders);

        let mut query = sqlx::query(&sql);
        for id in user_ids {
            query = query.bind(id);
        }

        query.execute(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in delete_batch lecturers: {e}"))
        })?;

        Ok(())
    }

    pub async fn search_lecturers(
        pool: &MySqlPool,
        search: Option<&str>,
        activated: Option<bool>,
        has_activation_key: Option<bool>,
        term_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<LecturerDTO>, i64), AppError> {
        let mut where_conditions = Vec::new();
        let mut bindings: Vec<String> = Vec::new();

        if let Some(tid) = term_id {
            where_conditions.push(format!(
                "EXISTS (SELECT 1 FROM school_classes sc WHERE sc.term_id = {} AND sc.lecturer_id = l.user_id)",
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
                    "(LOWER(l.code) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)"
                        .to_string(),
                );
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
               FROM lecturers l
               JOIN users u ON l.user_id = u.id
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
            .map_err(|e| AppError::Internal(format!("Database error in count lecturers: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            r#"SELECT l.user_id, l.code, u.name, u.email, u.activated,
                      u.activation_key, u.activation_key_expires_at,
                      u.created_date, u.last_modified_date
               FROM lecturers l
               JOIN users u ON l.user_id = u.id
               {}
               ORDER BY u.created_date DESC, l.user_id DESC
               LIMIT ? OFFSET ?"#,
            where_clause
        );

        let mut select_query = sqlx::query_as::<
            _,
            (
                i64,
                String,
                Option<String>,
                String,
                bool,
                Option<String>,
                Option<DateTime<Utc>>,
                Option<DateTime<Utc>>,
                Option<DateTime<Utc>>,
            ),
        >(&select_sql);

        for bind in &bindings {
            select_query = select_query.bind(bind);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select lecturers: {e}")))?;

        let now = Utc::now();
        let dtos = rows
            .into_iter()
            .map(|r| {
                let has_key = r.5.is_some();
                let is_key_expired = r.6.map(|exp| exp <= now).unwrap_or(false);
                LecturerDTO {
                    user_id: r.0,
                    code: r.1,
                    name: r.2,
                    email: r.3,
                    activated: r.4,
                    has_activation_key: has_key,
                    activation_key_expires_at: r.6,
                    is_key_expired,
                    created_date: r.7,
                    last_modified_date: r.8,
                }
            })
            .collect();

        Ok((dtos, total))
    }

    pub async fn find_matching_user_ids(
        pool: &MySqlPool,
        search: Option<&str>,
        term_id: Option<i32>,
    ) -> Result<Vec<i64>, AppError> {
        let mut where_conditions = vec!["u.activated = 0".to_string()];
        let mut bindings = Vec::new();

        if let Some(tid) = term_id {
            where_conditions.push(format!(
                "EXISTS (SELECT 1 FROM school_classes sc WHERE sc.term_id = {} AND sc.lecturer_id = l.user_id)",
                tid
            ));
        }

        if let Some(s) = search {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                where_conditions.push(
                    "(LOWER(l.code) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)"
                        .to_string(),
                );
                bindings.push(pattern.clone());
                bindings.push(pattern.clone());
                bindings.push(pattern);
            }
        }

        let sql = format!(
            r#"SELECT DISTINCT l.user_id
               FROM lecturers l
               JOIN users u ON l.user_id = u.id
               WHERE {}"#,
            where_conditions.join(" AND ")
        );

        let mut query = sqlx::query_scalar::<_, i64>(&sql);
        for bind in &bindings {
            query = query.bind(bind);
        }

        let ids = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in find_matching_user_ids: {e}"))
        })?;

        Ok(ids)
    }
}
