use sqlx::MySqlPool;

use crate::domain::Term;
use crate::error::AppError;

pub struct TermRepository;

impl TermRepository {
    pub async fn find_by_name(pool: &MySqlPool, name: &str) -> Result<Option<Term>, AppError> {
        let term =
            sqlx::query_as::<_, Term>("SELECT * FROM terms WHERE LOWER(name) = LOWER(?) LIMIT 1")
                .bind(name.trim())
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Database error in find_by_name: {e}")))?;

        Ok(term)
    }

    pub async fn find_by_id(pool: &MySqlPool, id: i32) -> Result<Option<Term>, AppError> {
        let term = sqlx::query_as::<_, Term>("SELECT * FROM terms WHERE id = ? LIMIT 1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_by_id: {e}")))?;

        Ok(term)
    }

    pub async fn exists_by_id(pool: &MySqlPool, id: i32) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM terms WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in exists_by_id: {e}")))?;

        Ok(count > 0)
    }

    pub async fn exists_by_name(pool: &MySqlPool, name: &str) -> Result<bool, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM terms WHERE LOWER(name) = LOWER(?)")
                .bind(name.trim())
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in exists_by_name: {e}"))
                })?;

        Ok(count > 0)
    }

    pub async fn find_all(pool: &MySqlPool) -> Result<Vec<Term>, AppError> {
        let terms = sqlx::query_as::<_, Term>("SELECT * FROM terms")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_all terms: {e}")))?;

        Ok(terms)
    }

    pub async fn create(pool: &MySqlPool, name: &str) -> Result<Term, AppError> {
        let res = sqlx::query(
            "INSERT INTO terms (name, created_date, last_modified_date) VALUES (?, NOW(), NOW())",
        )
        .bind(name.trim())
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in create term: {e}")))?;

        let id = res.last_insert_id() as i32;
        Self::find_by_id(pool, id).await?.ok_or_else(|| {
            AppError::Internal(format!(
                "Failed to retrieve newly created term with ID {id}"
            ))
        })
    }

    pub async fn find_user_ids_in_term(
        pool: &MySqlPool,
        user_ids: &[i64],
        term_id: i32,
    ) -> Result<Vec<i64>, AppError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query_str = format!(
            r#"SELECT u.id FROM users u WHERE u.id IN ({}) AND (
                EXISTS (SELECT s.user_id FROM students s JOIN school_classes sc ON s.school_class_id = sc.id WHERE s.user_id = u.id AND sc.term_id = ?)
                OR EXISTS (SELECT l.user_id FROM lecturers l JOIN school_classes sc ON sc.lecturer_id = l.user_id WHERE l.user_id = u.id AND sc.term_id = ?)
            )"#,
            placeholders
        );

        let mut query = sqlx::query_scalar::<_, i64>(&query_str);
        for id in user_ids {
            query = query.bind(id);
        }
        query = query.bind(term_id).bind(term_id);

        let ids = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in find_user_ids_in_term: {e}"))
        })?;

        Ok(ids)
    }

    pub async fn find_user_id_by_email(
        pool: &MySqlPool,
        email: &str,
    ) -> Result<Option<i64>, AppError> {
        let user_id = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
        )
        .bind(email.trim())
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in find_user_id_by_email: {e}")))?;

        Ok(user_id)
    }
}
