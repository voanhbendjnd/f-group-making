use chrono::{DateTime, Utc};
use sqlx::{MySql, MySqlPool, Transaction};

use crate::domain::{AllocationApplyRequest, AllocationPreview, AllocationRun};
use crate::error::AppError;

pub struct AllocationPreviewRepository;

impl AllocationPreviewRepository {
    pub async fn save(pool: &MySqlPool, preview: &AllocationPreview) -> Result<(), AppError> {
        sqlx::query(
            r#"INSERT INTO allocation_previews
               (id, owner_id, school_class_id, deadline_id, target_count, seed,
                snapshot_fingerprint, plan_fingerprint, payload, format_version,
                created_at, expires_at, applied_at, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&preview.id)
        .bind(preview.owner_id)
        .bind(preview.school_class_id)
        .bind(preview.deadline_id)
        .bind(preview.target_count)
        .bind(preview.seed)
        .bind(&preview.snapshot_fingerprint)
        .bind(&preview.plan_fingerprint)
        .bind(&preview.payload)
        .bind(preview.format_version)
        .bind(preview.created_at)
        .bind(preview.expires_at)
        .bind(preview.applied_at)
        .bind(preview.version)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save allocation preview: {e}")))?;

        Ok(())
    }

    pub async fn find_by_id(
        pool: &MySqlPool,
        id: &str,
    ) -> Result<Option<AllocationPreview>, AppError> {
        let row = sqlx::query_as::<_, AllocationPreview>(
            "SELECT * FROM allocation_previews WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find allocation preview: {e}")))?;

        Ok(row)
    }

    pub async fn find_for_update(
        tx: &mut Transaction<'_, MySql>,
        id: &str,
    ) -> Result<Option<AllocationPreview>, AppError> {
        let row = sqlx::query_as::<_, AllocationPreview>(
            "SELECT * FROM allocation_previews WHERE id = ? FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to lock allocation preview: {e}")))?;

        Ok(row)
    }

    pub async fn update_applied_at(
        tx: &mut Transaction<'_, MySql>,
        id: &str,
        applied_at: DateTime<Utc>,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE allocation_previews SET applied_at = ? WHERE id = ?")
            .bind(applied_at)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update preview applied_at: {e}")))?;

        Ok(())
    }

    pub async fn find_paged(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
        offset: i64,
        limit: i64,
    ) -> Result<(Vec<AllocationPreview>, i64), AppError> {
        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM allocation_previews WHERE school_class_id = ? AND deadline_id = ?",
        )
        .bind(class_id)
        .bind(deadline_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to count previews: {e}")))?;

        let items = sqlx::query_as::<_, AllocationPreview>(
            r#"SELECT * FROM allocation_previews
               WHERE school_class_id = ? AND deadline_id = ?
               ORDER BY created_at DESC, id DESC
               LIMIT ? OFFSET ?"#,
        )
        .bind(class_id)
        .bind(deadline_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find previews: {e}")))?;

        Ok((items, total))
    }

    pub async fn find_eligible_for_recommendation(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
        owner_id: i64,
        snapshot_fingerprint: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<AllocationPreview>, AppError> {
        let items = sqlx::query_as::<_, AllocationPreview>(
            r#"SELECT * FROM allocation_previews
               WHERE school_class_id = ? AND deadline_id = ? AND owner_id = ?
                 AND applied_at IS NULL AND snapshot_fingerprint = ?
               ORDER BY id ASC
               LIMIT ? OFFSET ?"#,
        )
        .bind(class_id)
        .bind(deadline_id)
        .bind(owner_id)
        .bind(snapshot_fingerprint)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to query previews for recommendation: {e}"))
        })?;

        Ok(items)
    }
}

pub struct AllocationRunRepository;

impl AllocationRunRepository {
    pub async fn save(
        tx: &mut Transaction<'_, MySql>,
        run: &AllocationRun,
    ) -> Result<i64, AppError> {
        let res = sqlx::query(
            r#"INSERT INTO allocation_runs
               (preview_id, apply_request_id, actor_id, school_class_id, deadline_id,
                target_count, seed, applied_at, snapshot_fingerprint, plan_fingerprint, result_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&run.preview_id)
        .bind(run.apply_request_id)
        .bind(run.actor_id)
        .bind(run.school_class_id)
        .bind(run.deadline_id)
        .bind(run.target_count)
        .bind(run.seed)
        .bind(run.applied_at)
        .bind(&run.snapshot_fingerprint)
        .bind(&run.plan_fingerprint)
        .bind(&run.result_json)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save allocation run: {e}")))?;

        Ok(res.last_insert_id() as i64)
    }

    pub async fn update_result_json(
        tx: &mut Transaction<'_, MySql>,
        id: i64,
        result_json: &str,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE allocation_runs SET result_json = ? WHERE id = ?")
            .bind(result_json)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to update allocation run result_json: {e}"))
            })?;

        Ok(())
    }

    pub async fn find_paged(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
        offset: i64,
        limit: i64,
    ) -> Result<(Vec<AllocationRun>, i64), AppError> {
        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM allocation_runs WHERE school_class_id = ? AND deadline_id = ?",
        )
        .bind(class_id)
        .bind(deadline_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to count allocation runs: {e}")))?;

        let items = sqlx::query_as::<_, AllocationRun>(
            r#"SELECT * FROM allocation_runs
               WHERE school_class_id = ? AND deadline_id = ?
               ORDER BY applied_at DESC, id DESC
               LIMIT ? OFFSET ?"#,
        )
        .bind(class_id)
        .bind(deadline_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find allocation runs: {e}")))?;

        Ok((items, total))
    }

    pub async fn find_by_id_and_scope(
        pool: &MySqlPool,
        id: i64,
        class_id: i32,
        deadline_id: i32,
    ) -> Result<Option<AllocationRun>, AppError> {
        let row = sqlx::query_as::<_, AllocationRun>(
            "SELECT * FROM allocation_runs WHERE id = ? AND school_class_id = ? AND deadline_id = ?",
        )
        .bind(id)
        .bind(class_id)
        .bind(deadline_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find allocation run by id: {e}")))?;

        Ok(row)
    }
}

pub struct AllocationApplyRequestRepository;

impl AllocationApplyRequestRepository {
    #[allow(clippy::too_many_arguments)]
    pub async fn reserve(
        pool: &MySqlPool,
        owner_id: i64,
        class_id: i32,
        deadline_id: i32,
        preview_id: &str,
        key_hash: &str,
        request_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<i64, AppError> {
        let res = sqlx::query(
            r#"INSERT INTO allocation_apply_requests
               (owner_id, school_class_id, deadline_id, preview_id, key_hash, request_hash,
                status, created_at, expires_at, version)
               VALUES (?, ?, ?, ?, ?, ?, 'READY', NOW(), ?, 0)"#,
        )
        .bind(owner_id)
        .bind(class_id)
        .bind(deadline_id)
        .bind(preview_id)
        .bind(key_hash)
        .bind(request_hash)
        .bind(expires_at)
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to reserve allocation apply request: {e}"))
        })?;

        Ok(res.last_insert_id() as i64)
    }

    pub async fn find(
        pool: &MySqlPool,
        owner_id: i64,
        class_id: i32,
        deadline_id: i32,
        key_hash: &str,
    ) -> Result<Option<AllocationApplyRequest>, AppError> {
        let row = sqlx::query_as::<_, AllocationApplyRequest>(
            r#"SELECT * FROM allocation_apply_requests
               WHERE owner_id = ? AND school_class_id = ? AND deadline_id = ? AND key_hash = ?"#,
        )
        .bind(owner_id)
        .bind(class_id)
        .bind(deadline_id)
        .bind(key_hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find allocation apply request: {e}")))?;

        Ok(row)
    }

    pub async fn find_for_update(
        tx: &mut Transaction<'_, MySql>,
        id: i64,
    ) -> Result<Option<AllocationApplyRequest>, AppError> {
        let row = sqlx::query_as::<_, AllocationApplyRequest>(
            "SELECT * FROM allocation_apply_requests WHERE id = ? FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to lock allocation apply request: {e}")))?;

        Ok(row)
    }

    pub async fn update_status(
        tx: &mut Transaction<'_, MySql>,
        id: i64,
        status: &str,
        failure_code: Option<&str>,
        result_json: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE allocation_apply_requests SET status = ?, failure_code = ?, result_json = ? WHERE id = ?",
        )
        .bind(status)
        .bind(failure_code)
        .bind(result_json)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update allocation apply request status: {e}")))?;

        Ok(())
    }

    pub async fn mark_failed(pool: &MySqlPool, id: i64) -> Result<(), AppError> {
        sqlx::query(
            r#"UPDATE allocation_apply_requests
               SET status = 'FAILED', failure_code = 'allocationApplyFailed'
               WHERE id = ? AND status != 'SUCCEEDED'"#,
        )
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to mark request as failed: {e}")))?;

        Ok(())
    }
}
