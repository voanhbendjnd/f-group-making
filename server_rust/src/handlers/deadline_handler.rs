use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::deadline::{CloseDeadlineDTO, CreateDeadlineDTO, UpdateDeadlineDTO};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::deadline_service::DeadlineService;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadlineQuery {
    pub page: Option<i64>,
    pub size: Option<i64>,
    pub term_id: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateDeadlineQuery {
    pub class_id: i32,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupingSessionQuery {
    pub term_id: Option<i32>,
}

pub async fn create_deadline(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(dto): Json<CreateDeadlineDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let result =
        DeadlineService::create_deadline(&state.pool, &auth, dto, &state.event_sender).await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse::created(
            result,
            "Deadline created successfully",
        )),
    ))
}

pub async fn update_deadline(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    Json(dto): Json<UpdateDeadlineDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let result =
        DeadlineService::update_deadline(&state.pool, &auth, id, dto, &state.event_sender).await?;
    Ok(Json(RestResponse::success(
        result,
        "Deadline updated successfully",
    )))
}

pub async fn get_deadlines(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<DeadlineQuery>,
) -> Result<impl IntoResponse, AppError> {
    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(20).clamp(1, 200);

    let result =
        DeadlineService::get_deadlines(&state.pool, &auth, page, size, query.term_id).await?;
    Ok(Json(result))
}

pub async fn get_deadline_by_id(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    let result = DeadlineService::get_deadline_by_id(&state.pool, &auth, id).await?;
    Ok(Json(result))
}

pub async fn validate_deadline(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    Query(query): Query<ValidateDeadlineQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::STUDENT)?;

    let result =
        DeadlineService::validate_deadline_for_student(&state.pool, &auth, id, query.class_id)
            .await?;
    Ok(Json(RestResponse::success(
        result,
        "Deadline validated successfully",
    )))
}

pub async fn get_my_activities(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::STUDENT)?;

    let activities = DeadlineService::get_my_activities(&state.pool, &auth).await?;
    Ok(Json(RestResponse::success(
        activities,
        "Get student deadline activities successfully",
    )))
}

pub async fn close_deadline(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    body: Option<Json<CloseDeadlineDTO>>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let req = body.map(|b| b.0).unwrap_or_default();
    let result =
        DeadlineService::close_deadline(&state.pool, &auth, id, req, &state.event_sender).await?;
    Ok(Json(RestResponse::success(
        result,
        "Deadline closed successfully",
    )))
}

pub async fn delete_deadline(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    body: Option<Json<CloseDeadlineDTO>>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let req = body.map(|b| b.0).unwrap_or_default();
    let _ =
        DeadlineService::close_deadline(&state.pool, &auth, id, req, &state.event_sender).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn ensure_grouping_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<i32>,
    Query(query): Query<GroupingSessionQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let result =
        DeadlineService::ensure_grouping_session(&state.pool, &auth, class_id, query.term_id)
            .await?;
    Ok(Json(RestResponse::success(
        result,
        "Class grouping workspace ready",
    )))
}
