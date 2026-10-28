use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::domain::AuthoritiesConstants;
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::security::AuthUser;
use crate::service::group_service::GroupService;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupReviewQuery {
    pub term_id: i32,
    pub class_id: Option<i32>,
    pub status: Option<String>,
    pub search: Option<String>,
    pub page: Option<u64>,
    pub size: Option<u64>,
}

pub async fn get_my_group_reviews(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<GroupReviewQuery>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let page = query.page.unwrap_or(1);
    let size = query.size.unwrap_or(20);

    let res = GroupService::get_my_group_reviews(
        &state.pool,
        &auth,
        query.term_id,
        query.class_id,
        query.status.as_deref(),
        query.search.as_deref(),
        page,
        size,
    )
    .await?;

    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Get assigned class group reviews successfully".to_string(),
            data: Some(res),
        }),
    ))
}
