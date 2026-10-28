use sqlx::MySqlPool;

use crate::dto::allocation::*;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::allocation_repository::AllocationRunRepository;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::security::AuthUser;
use crate::service::school_class_service::SchoolClassService;

pub struct AllocationHistoryService;

impl AllocationHistoryService {
    pub async fn list(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        page: i64,
        size: i64,
    ) -> Result<ResultPaginationDTO<AllocationHistorySummary>, AppError> {
        Self::authorize(pool, auth, deadline_id, class_id).await?;

        let page_size = size.clamp(1, 100);
        let offset = (page.max(1) - 1) * page_size;

        let (items, total) =
            AllocationRunRepository::find_paged(pool, class_id, deadline_id, offset, page_size)
                .await?;

        let summaries: Vec<AllocationHistorySummary> = items
            .into_iter()
            .map(|run| AllocationHistorySummary {
                run_id: run.id,
                preview_id: run.preview_id,
                actor_id: run.actor_id,
                target_group_count: run.target_count,
                seed: run.seed,
                applied_at: run.applied_at,
            })
            .collect();

        Ok(ResultPaginationDTO::new(summaries, total, page, page_size))
    }

    pub async fn detail(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        id: i64,
    ) -> Result<AllocationApplyDTO, AppError> {
        Self::authorize(pool, auth, deadline_id, class_id).await?;

        let run = AllocationRunRepository::find_by_id_and_scope(pool, id, class_id, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    "Allocation history not found",
                    "allocation",
                    "allocationHistoryNotFound",
                )
            })?;

        let detail: AllocationApplyDTO = serde_json::from_str(&run.result_json).map_err(|e| {
            AppError::Internal(format!("Failed to parse allocation history JSON: {e}"))
        })?;

        Ok(detail)
    }

    async fn authorize(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<(), AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let belongs =
            DeadlineRepository::count_by_deadline_id_and_class_id(pool, deadline_id, class_id)
                .await?;
        if belongs != 1 {
            return Err(AppError::not_found(
                "Deadline not found",
                "deadline",
                "deadlineNotFound",
            ));
        }

        Ok(())
    }
}
