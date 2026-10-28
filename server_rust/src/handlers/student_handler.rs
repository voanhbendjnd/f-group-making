use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashSet;

use crate::domain::AuthoritiesConstants;
use crate::dto::student::{CreateStudentDTO, StudentActivateAllQuery, StudentQuery};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::student_service::StudentService;

pub async fn create_student(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(dto): Json<CreateStudentDTO>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = StudentService::create_student(&state.pool, dto).await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse::created(result, "Create student successfully")),
    ))
}

pub async fn get_all_students(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<StudentQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let page = query.page.unwrap_or(1).max(1);
    let size = query.size.unwrap_or(20).clamp(1, 200);

    let major_search = query.major_search.or(query.major_code);

    let result = StudentService::get_students(
        &state.pool,
        query.search,
        major_search,
        query.major_id,
        query.activated,
        query.has_activation_key,
        page,
        size,
        query.term_id,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Get student list successfully",
    )))
}

pub async fn get_student_by_user_id(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(user_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let result = StudentService::get_student_by_user_id(&state.pool, user_id).await?;
    Ok(Json(RestResponse::success(
        result,
        "Get student details successfully",
    )))
}

pub async fn activate_all_students(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<StudentActivateAllQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let major_search = query.major_search.or(query.major_code);

    let result = StudentService::activate_all_matching(
        &state.pool,
        &state.mail_service,
        query.search,
        major_search,
        query.major_id,
        query.term_id,
    )
    .await?;

    Ok(Json(RestResponse::success(
        result,
        "Batch activation request accepted successfully",
    )))
}

#[derive(Debug, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportQueryParams {
    pub term_id: Option<i32>,
    pub confirmed_major_codes: Option<String>,
}

pub async fn import_students_from_excel(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query_params): Query<ImportQueryParams>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let mut file_bytes = None;
    let mut term_id = query_params.term_id;
    let mut confirmed_codes: HashSet<String> = HashSet::new();

    if let Some(ref c) = query_params.confirmed_major_codes {
        for code in c.split(',') {
            let trimmed = code.trim();
            if !trimmed.is_empty() {
                confirmed_codes.insert(trimmed.to_string());
            }
        }
    }

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::bad_request(
            format!("Failed to read multipart upload: {e}"),
            "studentManagement",
            "uploaderror",
        )
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let data = field.bytes().await.map_err(|e| {
                AppError::bad_request(
                    format!("Failed to read multipart upload: {e}"),
                    "studentManagement",
                    "uploaderror",
                )
            })?;
            file_bytes = Some(data);
        } else if name == "termId" && term_id.is_none() {
            if let Ok(text) = field.text().await {
                term_id = text.trim().parse::<i32>().ok();
            }
        } else if name == "confirmedMajorCodes" {
            if let Ok(text) = field.text().await {
                for code in text.split(',') {
                    let trimmed = code.trim();
                    if !trimmed.is_empty() {
                        confirmed_codes.insert(trimmed.to_string());
                    }
                }
            }
        }
    }

    let bytes = file_bytes.ok_or_else(|| {
        AppError::bad_request("File must not be empty.", "student", "excel.invalid")
    })?;

    let confirmed_set = if confirmed_codes.is_empty() {
        None
    } else {
        Some(confirmed_codes)
    };

    let result =
        StudentService::import_from_excel(&state.pool, &bytes, term_id, confirmed_set).await?;

    Ok(Json(RestResponse::success(
        result,
        "Student import processed",
    )))
}
