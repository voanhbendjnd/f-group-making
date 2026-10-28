use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::major::{MajorDTO, MajorQuery};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::major_service::MajorService;

pub async fn create_major(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(dto): Json<MajorDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = MajorService::create_major(&state.pool, dto).await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse::created(result, "Create major successfully")),
    ))
}

pub async fn get_majors(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<MajorQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(20).clamp(1, 200);

    let result =
        MajorService::get_majors(&state.pool, query.search, query.temporary_name, page, size)
            .await?;

    Ok(Json(RestResponse::success(
        result,
        "Get major list successfully",
    )))
}

pub async fn get_major_by_id(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = MajorService::get_major_by_id(&state.pool, id).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get major details successfully",
    )))
}

pub async fn update_major(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    Json(dto): Json<MajorDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = MajorService::update_major(&state.pool, id, dto).await?;
    Ok(Json(RestResponse::success(
        result,
        "Update major successfully",
    )))
}

pub async fn delete_major(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    MajorService::delete_major(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
