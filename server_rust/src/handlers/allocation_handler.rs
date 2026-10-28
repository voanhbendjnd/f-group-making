use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::dto::allocation::*;
use crate::dto::{PaginationQuery, RestResponse};
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::allocation_apply_service::AllocationApplyService;
use crate::service::allocation_history_service::AllocationHistoryService;
use crate::service::allocation_plan_history_service::AllocationPlanHistoryService;
use crate::service::allocation_preview_service::AllocationPreviewService;
use crate::service::allocation_recommendation_service::AllocationRecommendationService;

#[derive(Debug, Deserialize)]
pub struct SetupQuery {
    pub seed: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/plans/recommendation", get(get_recommendation))
        .route("/plans", get(list_plans))
        .route("/plans/{plan_id}", get(get_plan_detail))
        .route("/apply", post(apply_allocation))
        .route("/history", get(list_history))
        .route("/history/{run_id}", get(get_history_detail))
        .route("/overview", get(get_overview))
        .route("/setup", get(get_setup))
        .route("/preview", post(preview_allocation))
}

fn require_allocation_authority(auth: &AuthUser) -> Result<(), AppError> {
    if auth.is_admin()
        || auth
            .authorities
            .iter()
            .any(|r| r == "ROLE_LECTURE" || r == "ROLE_LECTURE_MASTER")
    {
        Ok(())
    } else {
        Err(AppError::forbidden(
            "Access denied",
            "allocation",
            "accessDenied",
        ))
    }
}

pub async fn get_recommendation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result =
        AllocationRecommendationService::recommend(&state.pool, &auth, deadline_id, class_id)
            .await?;
    Ok(Json(RestResponse::success(
        result,
        "Saved allocation recommendation retrieved",
    )))
}

pub async fn list_plans(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Query(pagination): Query<PaginationQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result = AllocationPlanHistoryService::list(
        &state.pool,
        &auth,
        deadline_id,
        class_id,
        pagination.page(),
        pagination.size(),
    )
    .await?;
    Ok(Json(RestResponse::success(
        result,
        "Random history retrieved",
    )))
}

pub async fn get_plan_detail(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, plan_id)): Path<(i32, i32, String)>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result =
        AllocationPlanHistoryService::detail(&state.pool, &auth, deadline_id, class_id, &plan_id)
            .await?;
    Ok(Json(RestResponse::success(
        result,
        "Saved random plan retrieved",
    )))
}

pub async fn apply_allocation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    headers: HeaderMap,
    Json(request): Json<AllocationApplyRequestDTO>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let key = headers
        .get("Idempotency-Key")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            AppError::bad_request(
                "Invalid Idempotency-Key",
                "allocation",
                "invalidIdempotencyKey",
            )
        })?;

    let result = AllocationApplyService::apply(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        &request.preview_id,
        key,
    )
    .await?;
    Ok(Json(RestResponse::success(result, "Allocation applied")))
}

pub async fn list_history(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Query(pagination): Query<PaginationQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result = AllocationHistoryService::list(
        &state.pool,
        &auth,
        deadline_id,
        class_id,
        pagination.page(),
        pagination.size(),
    )
    .await?;
    Ok(Json(RestResponse::success(
        result,
        "Allocation history retrieved",
    )))
}

pub async fn get_history_detail(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, run_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result =
        AllocationHistoryService::detail(&state.pool, &auth, deadline_id, class_id, run_id).await?;
    Ok(Json(RestResponse::success(
        result,
        "Allocation history retrieved",
    )))
}

pub async fn get_overview(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result = AllocationPreviewService::overview(
        &state.pool,
        auth.id,
        &auth.authorities,
        deadline_id,
        class_id,
    )
    .await?;
    Ok(Json(RestResponse::success(
        result,
        "Allocation overview retrieved",
    )))
}

pub async fn get_setup(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Query(query): Query<SetupQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result = AllocationPreviewService::setup(
        &state.pool,
        auth.id,
        &auth.authorities,
        deadline_id,
        class_id,
        query.seed,
    )
    .await?;
    Ok(Json(RestResponse::success(
        result,
        "Allocation setup retrieved",
    )))
}

pub async fn preview_allocation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Json(request): Json<AllocationPreviewRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_allocation_authority(&auth)?;
    let result = AllocationPreviewService::preview(
        &state.pool,
        auth.id,
        &auth.authorities,
        deadline_id,
        class_id,
        &request,
    )
    .await?;
    Ok(Json(RestResponse::success(
        result,
        "Allocation calculation completed",
    )))
}
