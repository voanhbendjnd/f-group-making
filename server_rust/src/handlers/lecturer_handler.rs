use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::domain::AuthoritiesConstants;
use crate::dto::lecturer::{CreateLecturerDTO, LecturerQuery};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::lecturer_service::LecturerService;

#[derive(Debug, serde::Deserialize)]
pub struct TermIdQuery {
    #[serde(rename = "termId")]
    pub term_id: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SearchTermQuery {
    pub search: Option<String>,
    #[serde(rename = "termId")]
    pub term_id: Option<i32>,
}

pub async fn create_lecturer(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(dto): Json<CreateLecturerDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = LecturerService::create_lecturer(&state.pool, dto).await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse::created(
            result,
            "Create lecturer successfully",
        )),
    ))
}

pub async fn get_all_lecturers(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<LecturerQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(20).clamp(1, 200);

    let result = LecturerService::get_lecturers(
        &state.pool,
        query.search,
        query.activated,
        query.has_activation_key,
        page,
        size,
        query.term_id,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Get lecturer list successfully",
    )))
}

pub async fn import_lecturers_from_excel(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(_term_query): Query<TermIdQuery>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let mut file_bytes = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            let data = field.bytes().await.map_err(|e| {
                AppError::bad_request(
                    format!("Failed to read multipart upload: {e}"),
                    "lecturerManagement",
                    "uploaderror",
                )
            })?;
            file_bytes = Some(data);
            break;
        }
    }

    let bytes = file_bytes.ok_or_else(|| {
        AppError::bad_request("File must not be empty.", "lecturerManagement", "emptyfile")
    })?;

    let result = LecturerService::import_from_excel(&state.pool, &bytes).await?;
    Ok(Json(RestResponse::success(
        result,
        "Import lecturers from Excel completed",
    )))
}

pub async fn activate_all_matching(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SearchTermQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = LecturerService::activate_all_matching(
        &state.pool,
        &state.mail_service,
        query.search,
        query.term_id,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Batch activation emails sent successfully",
    )))
}

pub async fn delete_lecturer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(user_id): Path<LongOrI64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    LecturerService::delete_lecturer(&state.pool, user_id.0).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, serde::Deserialize)]
pub struct LongOrI64(pub i64);

pub async fn delete_lecturers_batch(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(term_query): Query<TermIdQuery>,
    Json(user_ids): Json<Vec<i64>>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    LecturerService::delete_lecturers_batch(&state.pool, &user_ids, term_query.term_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
