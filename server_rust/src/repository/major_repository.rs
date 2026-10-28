use sqlx::MySqlPool;

use crate::domain::Major;
use crate::error::AppError;

pub struct MajorRepository;

impl MajorRepository {
    pub async fn find_by_id(pool: &MySqlPool, id: i32) -> Result<Option<Major>, AppError> {
        let major = sqlx::query_as::<_, Major>("SELECT * FROM majors WHERE id = ? LIMIT 1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_by_id: {e}")))?;

        Ok(major)
    }

    pub async fn find_all(pool: &MySqlPool) -> Result<Vec<Major>, AppError> {
        let majors = sqlx::query_as::<_, Major>("SELECT * FROM majors ORDER BY code ASC")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_all: {e}")))?;

        Ok(majors)
    }

    pub async fn find_by_code(pool: &MySqlPool, code: &str) -> Result<Option<Major>, AppError> {
        let major =
            sqlx::query_as::<_, Major>("SELECT * FROM majors WHERE LOWER(code) = LOWER(?) LIMIT 1")
                .bind(code.trim())
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Database error in find_by_code: {e}")))?;

        Ok(major)
    }

    pub async fn exists_by_code_ignore_case(
        pool: &MySqlPool,
        code: &str,
    ) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM majors WHERE LOWER(code) = LOWER(?)")
                .bind(code.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_code_ignore_case: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn exists_by_name_ignore_case(
        pool: &MySqlPool,
        name: &str,
    ) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM majors WHERE LOWER(name) = LOWER(?)")
                .bind(name.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_name_ignore_case: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn exists_by_code_ignore_case_and_id_not(
        pool: &MySqlPool,
        code: &str,
        id: i32,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM majors WHERE LOWER(code) = LOWER(?) AND id != ?",
        )
        .bind(code.trim())
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in exists_by_code_ignore_case_and_id_not: {e}"
            ))
        })?;

        Ok(count > 0)
    }

    pub async fn exists_by_name_ignore_case_and_id_not(
        pool: &MySqlPool,
        name: &str,
        id: i32,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM majors WHERE LOWER(name) = LOWER(?) AND id != ?",
        )
        .bind(name.trim())
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in exists_by_name_ignore_case_and_id_not: {e}"
            ))
        })?;

        Ok(count > 0)
    }

    pub async fn has_students(pool: &MySqlPool, major_id: i32) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM students WHERE major_id = ?")
            .bind(major_id)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in has_students: {e}")))?;

        Ok(count > 0)
    }

    pub async fn has_major_terms(pool: &MySqlPool, major_id: i32) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM major_terms WHERE major_id = ?")
            .bind(major_id)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in has_major_terms: {e}")))?;

        Ok(count > 0)
    }

    pub async fn create(pool: &MySqlPool, code: &str, name: &str) -> Result<Major, AppError> {
        let res = sqlx::query(
            "INSERT INTO majors (code, name, created_date, last_modified_date) VALUES (?, ?, NOW(), NOW())",
        )
        .bind(code.trim())
        .bind(name.trim())
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in create major: {e}")))?;

        let id = res.last_insert_id() as i32;
        Self::find_by_id(pool, id).await?.ok_or_else(|| {
            AppError::Internal(format!(
                "Failed to retrieve newly created major with ID {id}"
            ))
        })
    }

    pub async fn update(
        pool: &MySqlPool,
        id: i32,
        code: &str,
        name: &str,
    ) -> Result<Major, AppError> {
        sqlx::query(
            "UPDATE majors SET code = ?, name = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(code.trim())
        .bind(name.trim())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in update major: {e}")))?;

        Self::find_by_id(pool, id).await?.ok_or_else(|| {
            AppError::Internal(format!("Failed to retrieve updated major with ID {id}"))
        })
    }

    pub async fn delete(pool: &MySqlPool, id: i32) -> Result<(), AppError> {
        sqlx::query("DELETE FROM majors WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in delete major: {e}")))?;

        Ok(())
    }

    pub async fn find_paginated(
        pool: &MySqlPool,
        search: Option<&str>,
        temporary_name: Option<bool>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<Major>, i64), AppError> {
        let mut where_clauses: Vec<String> = Vec::new();
        let mut bindings: Vec<String> = Vec::new();

        if let Some(s) = search {
            let words: Vec<&str> = s.split_whitespace().collect();
            for word in words {
                let escaped = word
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_");
                let pattern = format!("%{}%", escaped);
                where_clauses.push("(LOWER(code) LIKE ? OR LOWER(name) LIKE ?)".to_string());
                bindings.push(pattern.clone());
                bindings.push(pattern);
            }
        }

        if let Some(temp) = temporary_name {
            if temp {
                where_clauses.push("LOWER(TRIM(name)) = LOWER(TRIM(code))".to_string());
            } else {
                where_clauses.push("LOWER(TRIM(name)) != LOWER(TRIM(code))".to_string());
            }
        }

        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let count_sql = format!("SELECT COUNT(*) FROM majors {}", where_sql);
        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
        for bind in &bindings {
            count_query = count_query.bind(bind);
        }
        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count majors: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            "SELECT * FROM majors {} ORDER BY created_date DESC, id DESC LIMIT ? OFFSET ?",
            where_sql
        );

        let mut select_query = sqlx::query_as::<_, Major>(&select_sql);
        for bind in &bindings {
            select_query = select_query.bind(bind);
        }
        select_query = select_query.bind(size).bind(offset);

        let items = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select majors: {e}")))?;

        Ok((items, total))
    }
}
