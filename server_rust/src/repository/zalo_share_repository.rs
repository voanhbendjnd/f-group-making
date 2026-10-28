use sqlx::MySqlPool;

use crate::domain::ZaloShare;
use crate::error::AppError;

pub struct ZaloShareRepository;

impl ZaloShareRepository {
    pub async fn find_by_scope_key(
        pool: &MySqlPool,
        scope_key: &str,
    ) -> Result<Option<ZaloShare>, AppError> {
        let row = sqlx::query_as::<_, ZaloShare>("SELECT * FROM zalo_shares WHERE scope_key = ?")
            .bind(scope_key)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to find zalo share: {e}")))?;
        Ok(row)
    }

    pub async fn find_by_scope_key_in(
        pool: &MySqlPool,
        scope_keys: &[String],
    ) -> Result<Vec<ZaloShare>, AppError> {
        if scope_keys.is_empty() {
            return Ok(Vec::new());
        }
        let in_clause = scope_keys
            .iter()
            .map(|k| format!("'{}'", k.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT * FROM zalo_shares WHERE scope_key IN ({})",
            in_clause
        );
        let rows = sqlx::query_as::<_, ZaloShare>(&sql)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to find zalo shares by keys: {e}")))?;
        Ok(rows)
    }

    pub async fn find_by_id(pool: &MySqlPool, id: i64) -> Result<Option<ZaloShare>, AppError> {
        let row = sqlx::query_as::<_, ZaloShare>("SELECT * FROM zalo_shares WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to find zalo share by id: {e}")))?;
        Ok(row)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn save_share(
        pool: &MySqlPool,
        id: Option<i64>,
        school_class_id: Option<i32>,
        lecturer_id: Option<i64>,
        term_id: i32,
        scope: &str,
        scope_key: &str,
        title: &str,
        invite_url: &str,
        description: Option<&str>,
        qr_public_id: Option<&str>,
        qr_format: Option<&str>,
        qr_bytes: Option<i64>,
        version: Option<i64>,
        actor: Option<&str>,
    ) -> Result<ZaloShare, AppError> {
        if let Some(existing_id) = id {
            let ver = version.unwrap_or(0);
            let res = sqlx::query(
                r#"UPDATE zalo_shares
                   SET title = ?, invite_url = ?, description = ?,
                       qr_public_id = ?, qr_format = ?, qr_bytes = ?,
                       version = version + 1, last_modified_by = ?, last_modified_date = NOW()
                   WHERE id = ? AND version = ?"#,
            )
            .bind(title.trim())
            .bind(invite_url.trim())
            .bind(description.map(|d| d.trim()))
            .bind(qr_public_id)
            .bind(qr_format)
            .bind(qr_bytes)
            .bind(actor)
            .bind(existing_id)
            .bind(ver)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update zalo share: {e}")))?;

            if res.rows_affected() == 0 {
                return Err(AppError::conflict(
                    "Zalo share changed. Reload before saving.",
                    "zaloShare",
                    "zaloConflict",
                ));
            }

            Self::find_by_id(pool, existing_id)
                .await?
                .ok_or_else(|| AppError::Internal("Updated zalo share not found".to_string()))
        } else {
            let res = sqlx::query(
                r#"INSERT INTO zalo_shares (school_class_id, lecturer_id, term_id, scope, scope_key,
                                            title, invite_url, description, qr_public_id, qr_format, qr_bytes,
                                            version, created_by, created_date, last_modified_by, last_modified_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), ?, NOW())"#,
            )
            .bind(school_class_id)
            .bind(lecturer_id)
            .bind(term_id)
            .bind(scope)
            .bind(scope_key)
            .bind(title.trim())
            .bind(invite_url.trim())
            .bind(description.map(|d| d.trim()))
            .bind(qr_public_id)
            .bind(qr_format)
            .bind(qr_bytes)
            .bind(actor)
            .bind(actor)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to insert zalo share: {e}")))?;

            let new_id = res.last_insert_id() as i64;
            Self::find_by_id(pool, new_id)
                .await?
                .ok_or_else(|| AppError::Internal("Inserted zalo share not found".to_string()))
        }
    }

    pub async fn delete_share(pool: &MySqlPool, id: i64, version: i64) -> Result<bool, AppError> {
        let res = sqlx::query("DELETE FROM zalo_shares WHERE id = ? AND version = ?")
            .bind(id)
            .bind(version)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to delete zalo share: {e}")))?;
        Ok(res.rows_affected() > 0)
    }
}
