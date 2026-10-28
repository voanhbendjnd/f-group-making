use chrono::{DateTime, Utc};
use sqlx::MySqlPool;

use crate::domain::{Deadline, DeadlineClassWindow, SchoolClass};
use crate::error::AppError;

pub struct DeadlineRepository;

impl DeadlineRepository {
    pub async fn find_by_id(pool: &MySqlPool, id: i32) -> Result<Option<Deadline>, AppError> {
        let deadline =
            sqlx::query_as::<_, Deadline>("SELECT * FROM deadlines WHERE id = ? LIMIT 1")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in deadline find_by_id: {e}"))
                })?;

        Ok(deadline)
    }

    pub async fn find_for_update(pool: &MySqlPool, id: i32) -> Result<Option<Deadline>, AppError> {
        let deadline =
            sqlx::query_as::<_, Deadline>("SELECT * FROM deadlines WHERE id = ? FOR UPDATE")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in deadline find_for_update: {e}"))
                })?;

        Ok(deadline)
    }

    pub async fn find_all_by_school_class_id(
        pool: &MySqlPool,
        school_class_id: i32,
    ) -> Result<Vec<Deadline>, AppError> {
        let sql = r#"
            SELECT DISTINCT d.*
            FROM deadlines d
            JOIN school_class_deadline scd ON d.id = scd.deadline_id
            WHERE scd.school_class_id = ?
            ORDER BY d.id ASC
        "#;

        let rows = sqlx::query_as::<_, Deadline>(sql)
            .bind(school_class_id)
            .fetch_all(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Database error in find_all_by_school_class_id: {e}"
                ))
            })?;

        Ok(rows)
    }

    pub async fn count_by_deadline_id_and_class_id(
        pool: &MySqlPool,
        deadline_id: i32,
        school_class_id: i32,
    ) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM school_class_deadline WHERE deadline_id = ? AND school_class_id = ?",
        )
        .bind(deadline_id)
        .bind(school_class_id)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in count_by_deadline_id_and_class_id: {e}"
            ))
        })?;

        Ok(count)
    }

    pub async fn find_classes_by_deadline_id(
        pool: &MySqlPool,
        deadline_id: i32,
    ) -> Result<Vec<SchoolClass>, AppError> {
        let sql = r#"
            SELECT sc.*
            FROM school_classes sc
            JOIN school_class_deadline scd ON sc.id = scd.school_class_id
            WHERE scd.deadline_id = ?
            ORDER BY sc.id ASC
        "#;

        let rows = sqlx::query_as::<_, SchoolClass>(sql)
            .bind(deadline_id)
            .fetch_all(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Database error in find_classes_by_deadline_id: {e}"
                ))
            })?;

        Ok(rows)
    }

    pub async fn find_class_windows_by_deadline_id(
        pool: &MySqlPool,
        deadline_id: i32,
    ) -> Result<Vec<DeadlineClassWindow>, AppError> {
        let rows = sqlx::query_as::<_, DeadlineClassWindow>(
            "SELECT deadline_id, school_class_id, end_time_override FROM school_class_deadline WHERE deadline_id = ?",
        )
        .bind(deadline_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_class_windows_by_deadline_id: {e}"
            ))
        })?;

        Ok(rows)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_deadline(
        pool: &MySqlPool,
        name: &str,
        description: Option<&str>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        status: &str,
        class_ids: &[i32],
        actor: Option<&str>,
    ) -> Result<Deadline, AppError> {
        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to begin transaction for deadline create: {e}"
            ))
        })?;

        let res = sqlx::query(
            r#"INSERT INTO deadlines (name, description, start_time, end_time, status, version, schedule_revision, created_by, created_date, last_modified_by, last_modified_date)
               VALUES (?, ?, ?, ?, ?, 0, 0, ?, NOW(), ?, NOW())"#,
        )
        .bind(name.trim())
        .bind(description)
        .bind(start_time)
        .bind(end_time)
        .bind(status)
        .bind(actor)
        .bind(actor)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to insert deadline: {e}")))?;

        let deadline_id = res.last_insert_id() as i32;

        for &class_id in class_ids {
            sqlx::query(
                "INSERT IGNORE INTO school_class_deadline (deadline_id, school_class_id, end_time_override) VALUES (?, ?, NULL)",
            )
            .bind(deadline_id)
            .bind(class_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to link school class {class_id} to deadline: {e}"))
            })?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit deadline create: {e}")))?;

        Self::find_by_id(pool, deadline_id).await?.ok_or_else(|| {
            AppError::Internal(format!(
                "Failed to retrieve newly created deadline {deadline_id}"
            ))
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_deadline_record(
        pool: &MySqlPool,
        id: i32,
        name: &str,
        description: Option<&str>,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        status: &str,
        overrides: &[(i32, Option<DateTime<Utc>>)],
        actor: Option<&str>,
    ) -> Result<Deadline, AppError> {
        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to begin transaction for deadline update: {e}"
            ))
        })?;

        sqlx::query(
            r#"UPDATE deadlines
               SET name = ?, description = ?, start_time = ?, end_time = ?, status = ?,
                   version = version + 1, schedule_revision = schedule_revision + 1,
                   last_modified_by = ?, last_modified_date = NOW()
               WHERE id = ?"#,
        )
        .bind(name.trim())
        .bind(description)
        .bind(start_time)
        .bind(end_time)
        .bind(status)
        .bind(actor)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update deadline: {e}")))?;

        for (class_id, end_override) in overrides {
            sqlx::query(
                r#"INSERT INTO school_class_deadline (deadline_id, school_class_id, end_time_override)
                   VALUES (?, ?, ?)
                   ON DUPLICATE KEY UPDATE end_time_override = VALUES(end_time_override)"#,
            )
            .bind(id)
            .bind(class_id)
            .bind(end_override)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Failed to update deadline class window for class {class_id}: {e}"
                ))
            })?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit deadline update: {e}")))?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal(format!("Failed to retrieve updated deadline {id}")))
    }

    pub async fn close_deadline_record(
        pool: &MySqlPool,
        id: i32,
        closed_at: DateTime<Utc>,
        actor: Option<&str>,
    ) -> Result<Deadline, AppError> {
        let mut tx = pool.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to begin transaction for close_deadline: {e}"
            ))
        })?;

        sqlx::query(
            r#"UPDATE deadlines
               SET end_time = ?, version = version + 1, schedule_revision = schedule_revision + 1,
                   last_modified_by = ?, last_modified_date = NOW()
               WHERE id = ?"#,
        )
        .bind(closed_at)
        .bind(actor)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to close deadline: {e}")))?;

        sqlx::query(
            "UPDATE school_class_deadline SET end_time_override = NULL WHERE deadline_id = ?",
        )
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to clear deadline class windows: {e}")))?;

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit close deadline: {e}")))?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal(format!("Failed to retrieve closed deadline {id}")))
    }

    pub async fn search_deadlines_admin(
        pool: &MySqlPool,
        term_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<Deadline>, i64), AppError> {
        let where_clause = if term_id.is_some() {
            "WHERE EXISTS (SELECT 1 FROM school_class_deadline scd JOIN school_classes sc ON scd.school_class_id = sc.id WHERE scd.deadline_id = d.id AND sc.term_id = ?)"
        } else {
            ""
        };

        let count_sql = format!("SELECT COUNT(DISTINCT d.id) FROM deadlines d {where_clause}");
        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
        if let Some(tid) = term_id {
            count_query = count_query.bind(tid);
        }
        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count deadlines: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            "SELECT DISTINCT d.* FROM deadlines d {where_clause} ORDER BY d.id DESC LIMIT ? OFFSET ?"
        );

        let mut select_query = sqlx::query_as::<_, Deadline>(&select_sql);
        if let Some(tid) = term_id {
            select_query = select_query.bind(tid);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select deadlines: {e}")))?;

        Ok((rows, total))
    }

    pub async fn search_deadlines_lecturer(
        pool: &MySqlPool,
        lecturer_id: i64,
        term_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<Deadline>, i64), AppError> {
        let where_term = if term_id.is_some() {
            "AND sc.term_id = ?"
        } else {
            ""
        };

        let count_sql = format!(
            r#"SELECT COUNT(DISTINCT d.id)
               FROM deadlines d
               JOIN school_class_deadline scd ON d.id = scd.deadline_id
               JOIN school_classes sc ON scd.school_class_id = sc.id
               WHERE sc.lecturer_id = ? {where_term}"#
        );

        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(lecturer_id);
        if let Some(tid) = term_id {
            count_query = count_query.bind(tid);
        }
        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count deadlines: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            r#"SELECT DISTINCT d.*
               FROM deadlines d
               JOIN school_class_deadline scd ON d.id = scd.deadline_id
               JOIN school_classes sc ON scd.school_class_id = sc.id
               WHERE sc.lecturer_id = ? {where_term}
               ORDER BY d.id DESC
               LIMIT ? OFFSET ?"#
        );

        let mut select_query = sqlx::query_as::<_, Deadline>(&select_sql).bind(lecturer_id);
        if let Some(tid) = term_id {
            select_query = select_query.bind(tid);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select deadlines: {e}")))?;

        Ok((rows, total))
    }

    pub async fn search_deadlines_student(
        pool: &MySqlPool,
        class_id: i32,
        term_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<Deadline>, i64), AppError> {
        let where_term = if term_id.is_some() {
            "AND sc.term_id = ?"
        } else {
            ""
        };

        let count_sql = format!(
            r#"SELECT COUNT(DISTINCT d.id)
               FROM deadlines d
               JOIN school_class_deadline scd ON d.id = scd.deadline_id
               JOIN school_classes sc ON scd.school_class_id = sc.id
               WHERE sc.id = ? {where_term}"#
        );

        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(class_id);
        if let Some(tid) = term_id {
            count_query = count_query.bind(tid);
        }
        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count deadlines: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            r#"SELECT DISTINCT d.*
               FROM deadlines d
               JOIN school_class_deadline scd ON d.id = scd.deadline_id
               JOIN school_classes sc ON scd.school_class_id = sc.id
               WHERE sc.id = ? {where_term}
               ORDER BY d.id DESC
               LIMIT ? OFFSET ?"#
        );

        let mut select_query = sqlx::query_as::<_, Deadline>(&select_sql).bind(class_id);
        if let Some(tid) = term_id {
            select_query = select_query.bind(tid);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select deadlines: {e}")))?;

        Ok((rows, total))
    }
}
