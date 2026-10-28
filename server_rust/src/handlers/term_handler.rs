use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::term::{CreateTermRequestDTO, TermQuery};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::term_service::TermService;

pub async fn get_terms(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<TermQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::STUDENT,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let terms =
        TermService::get_available_terms(&state.pool, query.current_and_future_only).await?;
    Ok(Json(RestResponse::success(
        terms,
        "Get available terms successfully",
    )))
}

pub async fn get_current_term(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::STUDENT,
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let current_term = TermService::get_current_term(&state.pool).await?;
    Ok(Json(RestResponse::success(
        current_term,
        "Get current term successfully",
    )))
}

pub async fn create_term(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(request): Json<CreateTermRequestDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = TermService::create_future_term(&state.pool, request).await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse::created(result, "Create term successfully")),
    ))
}
