use chrono::{DateTime, Utc};
use sqlx::MySqlPool;
use std::collections::HashSet;

use crate::domain::User;
use crate::error::AppError;

pub struct UserRepository;

impl UserRepository {
    pub async fn find_by_email(pool: &MySqlPool, email: &str) -> Result<Option<User>, AppError> {
        let user =
            sqlx::query_as::<_, User>("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1")
                .bind(email.trim())
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Database error in find_by_email: {e}")))?;

        Ok(user)
    }

    pub async fn find_by_id(pool: &MySqlPool, id: i64) -> Result<Option<User>, AppError> {
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ? LIMIT 1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_by_id: {e}")))?;

        Ok(user)
    }

    pub async fn find_by_activation_key(
        pool: &MySqlPool,
        key: &str,
    ) -> Result<Option<User>, AppError> {
        let user =
            sqlx::query_as::<_, User>("SELECT * FROM users WHERE activation_key = ? LIMIT 1")
                .bind(key.trim())
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in find_by_activation_key: {e}"))
                })?;

        Ok(user)
    }

    pub async fn find_by_reset_key(pool: &MySqlPool, key: &str) -> Result<Option<User>, AppError> {
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE reset_key = ? LIMIT 1")
            .bind(key.trim())
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_by_reset_key: {e}")))?;

        Ok(user)
    }

    pub async fn find_by_ids(pool: &MySqlPool, ids: &[i64]) -> Result<Vec<User>, AppError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query_str = format!("SELECT * FROM users WHERE id IN ({})", placeholders);

        let mut query = sqlx::query_as::<_, User>(&query_str);
        for id in ids {
            query = query.bind(id);
        }

        let users = query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in find_by_ids: {e}")))?;

        Ok(users)
    }

    pub async fn find_authorities_by_user_id(
        pool: &MySqlPool,
        user_id: i64,
    ) -> Result<HashSet<String>, AppError> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT authority_name FROM user_authority WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_authorities_by_user_id: {e}"
            ))
        })?;

        Ok(rows.into_iter().collect())
    }

    pub async fn update_session_id(
        pool: &MySqlPool,
        user_id: i64,
        session_id: &str,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE users SET session_id = ?, last_modified_date = NOW() WHERE id = ?")
            .bind(session_id)
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in update_session_id: {e}")))?;

        Ok(())
    }

    pub async fn update_refresh_token(
        pool: &MySqlPool,
        user_id: i64,
        refresh_token: &str,
    ) -> Result<u64, AppError> {
        let result = sqlx::query(
            "UPDATE users SET refresh_token = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(refresh_token)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in update_refresh_token: {e}")))?;

        Ok(result.rows_affected())
    }

    pub async fn assign_activation_key(
        pool: &MySqlPool,
        user_id: i64,
        key: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE users SET activation_key = ?, activation_key_expires_at = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(key)
        .bind(expires_at)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in assign_activation_key: {e}")))?;

        Ok(())
    }

    pub async fn activate_and_set_password(
        pool: &MySqlPool,
        user_id: i64,
        password_hash: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE users SET password_hash = ?, activated = 1, activation_key = NULL, activation_key_expires_at = NULL, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(password_hash)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in activate_and_set_password: {e}")))?;

        Ok(())
    }

    pub async fn update_reset_key(
        pool: &MySqlPool,
        user_id: i64,
        reset_key: &str,
        reset_date: DateTime<Utc>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE users SET reset_key = ?, reset_date = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(reset_key)
        .bind(reset_date)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in update_reset_key: {e}")))?;

        Ok(())
    }

    pub async fn complete_password_reset(
        pool: &MySqlPool,
        user_id: i64,
        password_hash: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE users SET password_hash = ?, reset_key = NULL, reset_date = NULL, session_id = NULL, refresh_token = NULL, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(password_hash)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in complete_password_reset: {e}")))?;

        Ok(())
    }

    pub async fn add_authority(
        pool: &MySqlPool,
        user_id: i64,
        authority: &str,
    ) -> Result<(), AppError> {
        sqlx::query("INSERT IGNORE INTO user_authority (user_id, authority_name) VALUES (?, ?)")
            .bind(user_id)
            .bind(authority)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in add_authority: {e}")))?;

        Ok(())
    }

    pub async fn find_existing_emails(
        pool: &MySqlPool,
        emails: &[String],
    ) -> Result<HashSet<String>, AppError> {
        if emails.is_empty() {
            return Ok(HashSet::new());
        }

        let placeholders = emails.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT LOWER(email) FROM users WHERE LOWER(email) IN ({})",
            placeholders
        );

        let mut query = sqlx::query_scalar::<_, String>(&sql);
        for e in emails {
            query = query.bind(e.trim().to_lowercase());
        }

        let existing = query.fetch_all(pool).await.map_err(|e| {
            AppError::Internal(format!("Database error in find_existing_emails: {e}"))
        })?;

        Ok(existing.into_iter().collect())
    }

    pub async fn delete_not_activated_users(
        pool: &MySqlPool,
        before: DateTime<Utc>,
    ) -> Result<u64, AppError> {
        let result = sqlx::query(
            "DELETE FROM users WHERE activated = 0 AND activation_key IS NOT NULL AND last_modified_date < ?",
        )
        .bind(before)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in delete_not_activated_users: {e}")))?;

        Ok(result.rows_affected())
    }
}
