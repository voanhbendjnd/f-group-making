use axum::extract::{Multipart, Path, Query, State};
use axum::http::header::{HeaderMap, HeaderValue, CACHE_CONTROL, CONTENT_TYPE};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::domain::AuthoritiesConstants;
use crate::dto::group::ZaloShareWriteRequest;
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::security::AuthUser;
use crate::service::zalo_share_service::ZaloShareService;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZaloQuery {
    pub term_id: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZaloDeleteQuery {
    pub term_id: i32,
    pub version: i64,
}

pub async fn get_class_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<i32>,
    Query(query): Query<ZaloQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let share = ZaloShareService::class_share(&state.pool, &auth, class_id, query.term_id).await?;
    let mut headers = HeaderMap::new();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));

    Ok((
        headers,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Call API success!".to_string(),
            data: share,
        }),
    ))
}

pub async fn save_class_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(class_id): Path<i32>,
    Query(query): Query<ZaloQuery>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let (req, qr_bytes, qr_format) = parse_zalo_multipart(multipart).await?;

    let share = ZaloShareService::save_class(
        &state.pool,
        &state.event_sender,
        &auth,
        class_id,
        query.term_id,
        req,
        qr_bytes,
        qr_format,
    )
    .await?;

    Ok(Json(RestResponse {
        status_code: 200,
        error: None,
        message: "Call API success!".to_string(),
        data: Some(share),
    }))
}

pub async fn delete_class_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((class_id, id)): Path<(i32, i64)>,
    Query(query): Query<ZaloDeleteQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    ZaloShareService::delete_class(
        &state.pool,
        &auth,
        class_id,
        query.term_id,
        id,
        query.version,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_lecturer_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(lecturer_id): Path<i64>,
    Query(query): Query<ZaloQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let share =
        ZaloShareService::lecturer_share(&state.pool, &auth, lecturer_id, query.term_id).await?;
    let mut headers = HeaderMap::new();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));

    Ok((
        headers,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Call API success!".to_string(),
            data: share,
        }),
    ))
}

pub async fn save_lecturer_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(lecturer_id): Path<i64>,
    Query(query): Query<ZaloQuery>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let (req, qr_bytes, qr_format) = parse_zalo_multipart(multipart).await?;

    let share = ZaloShareService::save_lecturer(
        &state.pool,
        &state.event_sender,
        &auth,
        lecturer_id,
        query.term_id,
        req,
        qr_bytes,
        qr_format,
    )
    .await?;

    Ok(Json(RestResponse {
        status_code: 200,
        error: None,
        message: "Call API success!".to_string(),
        data: Some(share),
    }))
}

pub async fn delete_lecturer_zalo_share(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((lecturer_id, id)): Path<(i64, i64)>,
    Query(query): Query<ZaloDeleteQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    ZaloShareService::delete_lecturer(
        &state.pool,
        &auth,
        lecturer_id,
        query.term_id,
        id,
        query.version,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_mine_zalo_shares(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[AuthoritiesConstants::STUDENT])?;

    let shares = ZaloShareService::mine(&state.pool, &auth).await?;
    let mut headers = HeaderMap::new();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));

    Ok((
        headers,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Call API success!".to_string(),
            data: Some(shares),
        }),
    ))
}

pub async fn get_qr(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let (bytes, content_type) = ZaloShareService::qr(&state.pool, &auth, id).await?;

    let mut headers = HeaderMap::new();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&content_type).unwrap_or(HeaderValue::from_static("image/png")),
    );
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );

    Ok((StatusCode::OK, headers, bytes).into_response())
}

async fn parse_zalo_multipart(
    mut multipart: Multipart,
) -> Result<(ZaloShareWriteRequest, Option<Vec<u8>>, Option<String>), AppError> {
    let mut data: Option<ZaloShareWriteRequest> = None;
    let mut qr_bytes: Option<Vec<u8>> = None;
    let mut qr_format: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::bad_request(
            format!("Multipart error: {e}"),
            "zaloShare",
            "invalidMultipart",
        )
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "data" {
            let text = field.text().await.map_err(|e| {
                AppError::bad_request(
                    format!("Invalid data part: {e}"),
                    "zaloShare",
                    "invalidData",
                )
            })?;
            let parsed: ZaloShareWriteRequest = serde_json::from_str(&text).map_err(|e| {
                AppError::bad_request(format!("JSON parse error: {e}"), "zaloShare", "invalidJson")
            })?;
            data = Some(parsed);
        } else if name == "qr" {
            let content_type = field.content_type().map(|c| c.to_string());
            let bytes = field
                .bytes()
                .await
                .map_err(|e| {
                    AppError::bad_request(format!("Invalid qr part: {e}"), "zaloShare", "invalidQr")
                })?
                .to_vec();
            if !bytes.is_empty() {
                let format = if content_type.as_deref() == Some("image/jpeg") {
                    "jpg".to_string()
                } else if content_type.as_deref() == Some("image/webp") {
                    "webp".to_string()
                } else {
                    "png".to_string()
                };
                qr_bytes = Some(bytes);
                qr_format = Some(format);
            }
        }
    }

    let req =
        data.ok_or_else(|| AppError::bad_request("Missing data part", "zaloShare", "missingData"))?;
    Ok((req, qr_bytes, qr_format))
}
