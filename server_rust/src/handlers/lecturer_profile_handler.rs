use axum::{extract::State, response::IntoResponse, Json};

use crate::domain::AuthoritiesConstants;
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::lecturer_profile_service::LecturerProfileService;

pub async fn get_current_profile(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::LECTURE,
        AuthoritiesConstants::LECTURE_MASTER,
    ])?;

    let result = LecturerProfileService::get_current_profile(&state.pool, &auth).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get lecturer profile successfully",
    )))
}
