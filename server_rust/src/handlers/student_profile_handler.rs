use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

use crate::domain::AuthoritiesConstants;
use crate::dto::student::UpdateStudentBioRequest;
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::student_profile_service::StudentProfileService;

pub async fn get_current_profile(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::STUDENT)?;

    let result = StudentProfileService::get_current_profile(&state.pool, auth.id).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get student profile successfully",
    )))
}

pub async fn update_bio(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateStudentBioRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::STUDENT)?;

    let updated = StudentProfileService::update_bio(
        &state.pool,
        auth.id,
        &auth.email,
        body.bio,
        &state.event_sender,
    )
    .await?;

    Ok(Json(RestResponse::success(
        json!({ "bio": updated.unwrap_or_default() }),
        "Update student bio successfully",
    )))
}

pub async fn delete_bio(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::STUDENT)?;

    StudentProfileService::delete_bio(&state.pool, auth.id, &auth.email, &state.event_sender)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
