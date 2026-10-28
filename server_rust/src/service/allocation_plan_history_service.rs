use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

use crate::domain::AllocationPreview;
use crate::dto::allocation::*;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::allocation_repository::AllocationPreviewRepository;
use crate::repository::user_repository::UserRepository;
use crate::security::AuthUser;
use crate::service::allocation_balance_policy::AllocationBalancePolicy;
use crate::service::allocation_preview_service::AllocationPreviewService;

pub struct AllocationPlanHistoryService;

impl AllocationPlanHistoryService {
    pub async fn list(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        page: i64,
        size: i64,
    ) -> Result<ResultPaginationDTO<PlanHistorySummary>, AppError> {
        let current = AllocationPreviewService::capture_for_history(
            pool,
            auth.id,
            &auth.authorities,
            deadline_id,
            class_id,
        )
        .await?
        .map(|c| c.overview);

        let page_size = size.clamp(1, 100);
        let offset = (page.max(1) - 1) * page_size;

        let (rows, total) =
            AllocationPreviewRepository::find_paged(pool, class_id, deadline_id, offset, page_size)
                .await?;

        let owner_ids: Vec<i64> = rows.iter().map(|r| r.owner_id).collect();
        let actors = Self::load_actors(pool, &owner_ids).await?;

        let summaries: Vec<PlanHistorySummary> = rows
            .into_iter()
            .map(|row| {
                let saved = Self::decode(&row);
                let actor_name = actors.get(&row.owner_id).cloned();
                Self::summary(
                    &row,
                    saved.as_ref(),
                    current.as_ref(),
                    actor_name.as_deref(),
                    auth.id,
                )
            })
            .collect();

        Ok(ResultPaginationDTO::new(summaries, total, page, page_size))
    }

    pub async fn detail(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        id: &str,
    ) -> Result<PlanHistoryDetail, AppError> {
        let current = AllocationPreviewService::capture_for_history(
            pool,
            auth.id,
            &auth.authorities,
            deadline_id,
            class_id,
        )
        .await?
        .map(|c| c.overview);

        let row = AllocationPreviewRepository::find_by_id(pool, id)
            .await?
            .filter(|r| r.school_class_id == class_id && r.deadline_id == deadline_id)
            .ok_or_else(Self::not_found)?;

        let saved = Self::decode(&row).ok_or_else(Self::not_found)?;
        let actor = UserRepository::find_by_id(pool, row.owner_id).await?;
        let actor_name = actor.and_then(|u| u.name);

        let summary = Self::summary(
            &row,
            Some(&saved),
            current.as_ref(),
            actor_name.as_deref(),
            auth.id,
        );

        let restored = AllocationPreviewDTO {
            scope: saved.scope,
            snapshot_fingerprint: saved.snapshot_fingerprint,
            plan_fingerprint: saved.plan_fingerprint,
            same_as_previous_plan: saved.same_as_previous_plan,
            result: saved.result,
            groups: saved.groups,
            report: saved.report,
            preview_id: Some(row.id),
            created_at: Some(row.created_at),
            expires_at: None,
        };

        Ok(PlanHistoryDetail {
            summary,
            preview: restored,
        })
    }

    pub fn summary(
        row: &AllocationPreview,
        saved: Option<&AllocationPreviewDTO>,
        current: Option<&AllocationPreviewOverview>,
        actor_name: Option<&str>,
        current_user_id: i64,
    ) -> PlanHistorySummary {
        let reason = match (saved, current) {
            (None, _) => Some("allocationPreviewInvalid".to_string()),
            (_, None) => Some("allocationDataConflict".to_string()),
            (Some(_), Some(curr)) if AllocationPreviewService::is_allocation_complete(curr) => {
                Some("allocationAlreadyComplete".to_string())
            }
            (Some(_), Some(curr)) if row.snapshot_fingerprint != curr.snapshot_fingerprint => {
                Some("allocationPreviewStale".to_string())
            }
            (Some(plan), Some(_)) => {
                let sizes: Vec<i32> = plan.groups.iter().map(|g| g.members.len() as i32).collect();
                if !AllocationBalancePolicy::is_balanced(&sizes) {
                    Some("allocationBalanceViolation".to_string())
                } else {
                    None
                }
            }
        };

        let status = if row.applied_at.is_some() {
            PlanHistoryStatus::Applied
        } else if reason.is_some() {
            PlanHistoryStatus::Invalid
        } else {
            PlanHistoryStatus::Unapplied
        };

        let total_students = saved.and_then(|s| s.report.as_ref().map(|r| r.students_after));
        let can_apply = status == PlanHistoryStatus::Unapplied && row.owner_id == current_user_id;
        let invalid_reason = if status == PlanHistoryStatus::Invalid {
            reason
        } else {
            None
        };

        PlanHistorySummary {
            plan_id: row.id.clone(),
            actor_id: row.owner_id,
            actor_name: actor_name.map(|s| s.to_string()),
            created_at: row.created_at,
            applied_at: row.applied_at,
            target_group_count: row.target_count,
            seed: row.seed,
            total_students,
            status,
            available: saved.is_some(),
            can_apply,
            invalid_reason,
        }
    }

    pub fn decode(row: &AllocationPreview) -> Option<AllocationPreviewDTO> {
        if row.format_version != 1 && row.format_version != 2 {
            return None;
        }
        let payload = row.payload.as_deref()?;

        let plan: AllocationPreviewDTO = serde_json::from_str(payload).ok()?;
        if plan.groups.is_empty()
            || plan.report.is_none()
            || plan.result.status != AllocationResultStatus::Feasible
            || plan.groups.len() as i32 != row.target_count
            || plan.scope.class_id != row.school_class_id
            || plan.scope.deadline_id != row.deadline_id
        {
            return None;
        }

        for g in &plan.groups {
            if g.members.is_empty() {
                return None;
            }
            if g.group_id.is_none()
                && (!g.new_group || g.plan_group_key.is_none() || g.protected_group)
            {
                return None;
            }
        }

        let distinct_keys: HashSet<String> = plan.groups.iter().map(|g| g.key()).collect();
        if distinct_keys.len() != plan.groups.len() {
            return None;
        }

        if row.snapshot_fingerprint != plan.snapshot_fingerprint {
            return None;
        }

        let computed_plan_fp =
            AllocationPreviewService::plan_fingerprint(&row.snapshot_fingerprint, &plan.groups)
                .ok()?;

        if row.plan_fingerprint != computed_plan_fp {
            return None;
        }

        Some(plan)
    }

    async fn load_actors(
        pool: &MySqlPool,
        owner_ids: &[i64],
    ) -> Result<HashMap<i64, String>, AppError> {
        if owner_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let in_clause = owner_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("SELECT id, name FROM users WHERE id IN ({})", in_clause);
        let rows = sqlx::query(&sql)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to load actors: {e}")))?;

        let mut map = HashMap::new();
        for r in rows {
            use sqlx::Row;
            let id: i64 = r.get("id");
            let name: Option<String> = r.get("name");
            if let Some(n) = name {
                map.insert(id, n);
            }
        }
        Ok(map)
    }

    fn not_found() -> AppError {
        AppError::not_found(
            "Saved allocation plan unavailable",
            "allocation",
            "planNotFound",
        )
    }
}
