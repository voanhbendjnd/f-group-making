use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::school_class::{AssignClassLecturerDTO, SchoolClassQuery};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::school_class_service::SchoolClassService;

pub async fn get_all_school_classes(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SchoolClassQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(20).clamp(1, 200);

    let result = SchoolClassService::get_school_classes(
        &state.pool,
        query.search,
        query.term_id,
        page,
        size,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Get school classes list successfully",
    )))
}

pub async fn get_my_classes(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SchoolClassQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(10).clamp(1, 200);

    let result = SchoolClassService::get_my_school_classes(
        &state.pool,
        query.search,
        query.term_id,
        auth.id,
        page,
        size,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Get assigned classes successfully",
    )))
}

pub async fn get_school_class_by_id(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let result = SchoolClassService::get_school_class_by_id(&state.pool, id, &auth).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get school class details successfully",
    )))
}

pub async fn get_students_by_class_id(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let result = SchoolClassService::get_students_by_class_id(&state.pool, id, &auth).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get school class students successfully",
    )))
}

pub async fn assign_lecturer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    Json(dto): Json<AssignClassLecturerDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = SchoolClassService::assign_lecturer(
        &state.pool,
        id,
        dto.lecturer_id,
        dto.expected_lecturer_id,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Assign class lecturer successfully",
    )))
}
