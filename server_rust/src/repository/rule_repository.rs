use sqlx::MySqlPool;

use crate::domain::Rule;
use crate::error::AppError;

pub struct RuleRepository;

impl RuleRepository {
    pub async fn find_by_school_class_id(
        pool: &MySqlPool,
        school_class_id: i32,
    ) -> Result<Vec<Rule>, AppError> {
        let rules = sqlx::query_as::<_, Rule>(
            "SELECT * FROM rules WHERE school_class_id = ? ORDER BY id ASC",
        )
        .bind(school_class_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Database error in find_by_school_class_id: {e}"))
        })?;

        Ok(rules)
    }

    pub async fn save_rules(
        pool: &MySqlPool,
        school_class_id: i32,
        rules: &[(String, i32, bool)],
    ) -> Result<(), AppError> {
        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!("Failed to begin transaction for save_rules: {e}"))
        })?;

        for (code, value, status) in rules {
            sqlx::query(
                r#"INSERT INTO rules (school_class_id, code, value, status, created_date, last_modified_date)
                   VALUES (?, ?, ?, ?, NOW(), NOW())
                   ON DUPLICATE KEY UPDATE value = VALUES(value), status = VALUES(status), last_modified_date = NOW()"#,
            )
            .bind(school_class_id)
            .bind(code)
            .bind(value)
            .bind(status)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save rule {code}: {e}")))?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit rules transaction: {e}")))?;

        Ok(())
    }

    pub async fn get_rule_value(
        pool: &MySqlPool,
        school_class_id: i32,
        code: &str,
    ) -> Result<Option<i32>, AppError> {
        let val = sqlx::query_scalar::<_, i32>(
            "SELECT value FROM rules WHERE school_class_id = ? AND code = ? AND status = 1 LIMIT 1",
        )
        .bind(school_class_id)
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in get_rule_value: {e}")))?;

        Ok(val)
    }
}
