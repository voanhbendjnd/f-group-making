use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::rule::SaveClassRulesDTO;
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::class_rule_service::ClassRuleService;

pub async fn get_rules(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let result = ClassRuleService::get_rules(&state.pool, &auth, class_id).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get class rules successfully",
    )))
}

pub async fn save_rules(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<i32>,
    Json(request): Json<SaveClassRulesDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let result = ClassRuleService::save_rules(&state.pool, &auth, class_id, request).await?;
    Ok(Json(RestResponse::success(
        result,
        "Save class rules successfully",
    )))
}
