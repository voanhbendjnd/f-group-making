use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;
use std::collections::HashSet;
use tokio::sync::broadcast::{self, Sender};

use crate::domain::{AllocationPreview, AllocationRun, GroupStatus};
use crate::dto::allocation::*;
use crate::dto::realtime::GroupRealtimeEvent;
use crate::error::AppError;
use crate::repository::allocation_repository::{
    AllocationApplyRequestRepository, AllocationPreviewRepository, AllocationRunRepository,
};
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::security::AuthUser;
use crate::service::allocation_balance_policy::AllocationBalancePolicy;
use crate::service::allocation_preview_service::AllocationPreviewService;
use crate::service::group_invitation_service::GroupInvitationService;
use crate::service::group_service::GroupService;
use crate::service::school_class_service::SchoolClassService;

pub struct AllocationApplyService;

impl AllocationApplyService {
    pub async fn apply(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        preview_id: &str,
        idempotency_key: &str,
    ) -> Result<AllocationApplyDTO, AppError> {
        let key = idempotency_key.trim();
        if key.is_empty() || key.len() > 128 || !key.chars().all(|c| c.is_ascii_graphic()) {
            return Err(AppError::bad_request(
                "Invalid Idempotency-Key",
                "allocation",
                "invalidIdempotencyKey",
            ));
        }

        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(Self::not_found)?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let actor_id = auth.id;
        let preview_id_clean = preview_id.to_lowercase();

        let preview = AllocationPreviewRepository::find_by_id(pool, &preview_id_clean)
            .await?
            .ok_or_else(Self::not_found)?;

        Self::check_owner(&preview, actor_id, class_id, deadline_id)?;

        let key_hash = Self::sha256_str(key);
        let request_hash = Self::sha256_str(&format!(
            "allocation-apply-v1:{}:{}:{}:{}",
            actor_id, class_id, deadline_id, preview_id_clean
        ));

        let expires_at = Utc::now() + Duration::days(30);

        let request_id = match AllocationApplyRequestRepository::reserve(
            pool,
            actor_id,
            class_id,
            deadline_id,
            &preview_id_clean,
            &key_hash,
            &request_hash,
            expires_at,
        )
        .await
        {
            Ok(id) => id,
            Err(_) => {
                let existing = AllocationApplyRequestRepository::find(
                    pool,
                    actor_id,
                    class_id,
                    deadline_id,
                    &key_hash,
                )
                .await?
                .ok_or_else(|| Self::conflict("allocationBusy"))?;
                existing.id
            }
        };

        match Self::execute_apply(
            pool,
            event_sender,
            auth,
            deadline_id,
            class_id,
            request_id,
            &request_hash,
        )
        .await
        {
            Ok(res) => Ok(res),
            Err(e) => {
                let _ = AllocationApplyRequestRepository::mark_failed(pool, request_id).await;
                Err(e)
            }
        }
    }

    async fn execute_apply(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        request_id: i64,
        request_hash: &str,
    ) -> Result<AllocationApplyDTO, AppError> {
        let mut tx = pool
            .begin()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to start apply transaction: {e}")))?;

        // Lock class & deadline scope
        let school_class = SchoolClassRepository::find_by_id_for_update_tx(&mut tx, class_id)
            .await?
            .ok_or_else(Self::not_found)?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let belongs =
            DeadlineRepository::count_by_deadline_id_and_class_id(pool, deadline_id, class_id)
                .await?;
        if belongs != 1 {
            return Err(AppError::forbidden(
                "Deadline not in class",
                "allocation",
                "deadlineNotInClass",
            ));
        }

        let request = AllocationApplyRequestRepository::find_for_update(&mut tx, request_id)
            .await?
            .ok_or_else(|| Self::conflict("allocationRequestNotFound"))?;

        if request.owner_id != auth.id
            || request.school_class_id != class_id
            || request.deadline_id != deadline_id
            || request.request_hash != request_hash
        {
            return Err(Self::conflict("allocationIdempotencyMismatch"));
        }

        if Utc::now() >= request.expires_at {
            return Err(Self::conflict("allocationIdempotencyExpired"));
        }

        if request.status == "SUCCEEDED" {
            if let Some(json_str) = request.result_json {
                if let Ok(result) = serde_json::from_str::<AllocationApplyDTO>(&json_str) {
                    tx.commit()
                        .await
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                    return Ok(result);
                }
            }
        }

        let preview = AllocationPreviewRepository::find_for_update(&mut tx, &request.preview_id)
            .await?
            .ok_or_else(Self::not_found)?;

        Self::check_owner(&preview, auth.id, class_id, deadline_id)?;

        if preview.applied_at.is_some() {
            return Err(Self::conflict("allocationPreviewUsed"));
        }

        if (preview.format_version != 1 && preview.format_version != 2) || preview.payload.is_none()
        {
            return Err(Self::conflict("allocationPreviewInvalid"));
        }

        AllocationApplyRequestRepository::update_status(
            &mut tx,
            request_id,
            "PROCESSING",
            None,
            None,
        )
        .await?;

        let current = AllocationPreviewService::capture(
            pool,
            auth.id,
            &auth.authorities,
            deadline_id,
            class_id,
        )
        .await?;
        AllocationPreviewService::require_allocation_needed(&current.overview)?;

        if preview.snapshot_fingerprint != current.overview.snapshot_fingerprint {
            return Err(Self::conflict("allocationPreviewStale"));
        }

        let plan_json = preview.payload.as_deref().unwrap_or("{}");
        let plan: AllocationPreviewDTO = serde_json::from_str(plan_json)
            .map_err(|_| Self::conflict("allocationPreviewInvalid"))?;

        if plan.groups.is_empty()
            || plan.report.is_none()
            || plan.result.status != AllocationResultStatus::Feasible
            || plan.groups.len() as i32 != preview.target_count
            || plan.result.target_group_count != preview.target_count
            || plan.scope.class_id != class_id
            || plan.scope.deadline_id != deadline_id
            || preview.snapshot_fingerprint != plan.snapshot_fingerprint
        {
            return Err(Self::conflict("allocationPreviewInvalid"));
        }

        let computed_plan_fp = AllocationPreviewService::plan_fingerprint(
            &preview.snapshot_fingerprint,
            &plan.groups,
        )?;
        if preview.plan_fingerprint != computed_plan_fp {
            return Err(Self::conflict("allocationPreviewInvalid"));
        }

        let sizes: Vec<i32> = plan.groups.iter().map(|g| g.members.len() as i32).collect();
        if !AllocationBalancePolicy::is_balanced(&sizes) {
            return Err(Self::conflict("allocationBalanceViolation"));
        }

        let mut affected: HashSet<i64> = HashSet::new();
        for g in &current.overview.groups {
            if g.status == GroupStatus::OPEN || g.status == GroupStatus::REVOKED {
                if let Some(id) = g.group_id {
                    affected.insert(id);
                }
            }
        }

        // Commit reservation update so locks can proceed
        tx.commit()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Use an isolated channel during batch application so intermediate mutation events
        // do not flood WebSocket clients before all groups and records are committed to the DB.
        let (internal_event_sender, _internal_rx) = broadcast::channel(256);

        // Cancel invitations for affected groups
        let cancelled = GroupInvitationService::cancel_for_allocation(
            pool,
            deadline_id,
            class_id,
            &affected,
            &auth.email,
            &internal_event_sender,
        )
        .await?;

        // Materialize newly created groups
        let materialized = GroupService::materialize_allocation_groups(
            pool,
            &internal_event_sender,
            &auth.email,
            deadline_id,
            class_id,
            &plan.groups,
        )
        .await?;

        // Apply membership assignments & leader elections
        let approved = GroupService::apply_allocation_plan(
            pool,
            &internal_event_sender,
            auth,
            deadline_id,
            class_id,
            &materialized.groups,
        )
        .await?;

        let report = AllocationPreviewService::resolve_report(
            plan.report.unwrap(),
            &materialized.created_group_ids,
        );

        let now = Utc::now();
        let mut post_tx = pool
            .begin()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to start post-apply tx: {e}")))?;

        let run = AllocationRun {
            id: 0,
            preview_id: preview.id.clone(),
            apply_request_id: Some(request_id),
            actor_id: auth.id,
            school_class_id: class_id,
            deadline_id,
            target_count: preview.target_count,
            seed: preview.seed,
            applied_at: now,
            snapshot_fingerprint: preview.snapshot_fingerprint.clone(),
            plan_fingerprint: preview.plan_fingerprint.clone(),
            result_json: "{}".to_string(),
        };

        let run_id = AllocationRunRepository::save(&mut post_tx, &run).await?;

        let result = AllocationApplyDTO {
            run_id: Some(run_id),
            preview_id: preview.id.clone(),
            actor_id: auth.id,
            class_id,
            deadline_id,
            target_group_count: preview.target_count,
            seed: preview.seed,
            applied_at: now,
            snapshot_fingerprint: preview.snapshot_fingerprint.clone(),
            plan_fingerprint: preview.plan_fingerprint.clone(),
            approved_group_ids: approved.clone(),
            cancelled_invitation_ids: cancelled,
            report,
        };

        let json_result = serde_json::to_string(&result)
            .map_err(|e| AppError::Internal(format!("Failed to serialize apply result: {e}")))?;

        AllocationRunRepository::update_result_json(&mut post_tx, run_id, &json_result).await?;
        AllocationPreviewRepository::update_applied_at(&mut post_tx, &preview.id, now).await?;
        AllocationApplyRequestRepository::update_status(
            &mut post_tx,
            request_id,
            "SUCCEEDED",
            None,
            Some(&json_result),
        )
        .await?;

        post_tx
            .commit()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Broadcast a single definitive realtime event now that all database changes are fully committed.
        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_ACCEPTED".to_string(),
            group_id: approved.first().copied(),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: now,
            payload: serde_json::json!({
                "runId": run_id,
                "previewId": preview.id,
                "approvedGroupIds": approved,
            }),
        };
        let _ = event_sender.send(event);

        Ok(result)
    }

    fn check_owner(
        preview: &AllocationPreview,
        actor_id: i64,
        class_id: i32,
        deadline_id: i32,
    ) -> Result<(), AppError> {
        if preview.owner_id != actor_id
            || preview.school_class_id != class_id
            || preview.deadline_id != deadline_id
        {
            return Err(Self::not_found());
        }
        Ok(())
    }

    fn not_found() -> AppError {
        AppError::not_found("Preview not found", "allocation", "previewNotFound")
    }

    fn conflict(key: &str) -> AppError {
        AppError::conflict("Allocation request cannot be applied", "allocation", key)
    }

    fn sha256_str(val: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(val.as_bytes());
        hex::encode(hasher.finalize())
    }
}
