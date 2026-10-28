use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::domain::AuthoritiesConstants;
use crate::dto::group::{
    CreateGroupRequest, LecturerCreateGroupRequest, RejectGroupRequest, SendInvitationRequest,
    TransferLeaderRequest,
};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::security::AuthUser;
use crate::service::group_invitation_service::GroupInvitationService;
use crate::service::group_recommendation_service::GroupRecommendationService;
use crate::service::group_service::GroupService;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
}

pub async fn get_workspace(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let ws = GroupService::get_workspace(&state.pool, &auth, deadline_id, class_id).await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Lấy dữ liệu không gian chọn nhóm thành công".to_string(),
            data: Some(ws),
        }),
    ))
}

pub async fn create_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupService::create_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        req,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse {
            status_code: 201,
            error: None,
            message: "Tạo nhóm mới thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn join_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupService::join_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Tham gia nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn leave_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    GroupService::leave_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn transfer_leader(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
    Json(req): Json<TransferLeaderRequest>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupService::transfer_leader(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        req,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Chuyển quyền trưởng nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn submit_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupService::submit_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Nộp danh sách nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn cancel_submit_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupService::cancel_submit_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Hủy nộp danh sách nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn disband_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    GroupService::disband_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// Lecturer Endpoints

pub async fn lecturer_create_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
    Json(req): Json<LecturerCreateGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_create_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        req,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse {
            status_code: 201,
            error: None,
            message: "Giảng viên tạo và duyệt nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_submit_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_submit_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Group submitted for review".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_move_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id, student_id, target_id)): Path<(i32, i32, i64, i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_move_member(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        target_id,
        student_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Group member moved successfully".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn accept_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::accept_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Phê duyệt nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn reject_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
    Json(req): Json<RejectGroupRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::reject_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        req,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Từ chối nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn revoke_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::revoke_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Thu hồi phê duyệt nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_add_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id, student_id)): Path<(i32, i32, i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_add_member(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        student_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Giảng viên thêm sinh viên vào nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id, student_id)): Path<(i32, i32, i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_remove_member(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        student_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Giảng viên xóa sinh viên khỏi nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_set_leader(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id, student_id)): Path<(i32, i32, i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    let group = GroupService::lecturer_set_leader(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        student_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Giảng viên chỉ định trưởng nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn lecturer_disband_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_any_role(&[
        AuthoritiesConstants::ADMIN,
        AuthoritiesConstants::LECTURE_MASTER,
        AuthoritiesConstants::LECTURE,
    ])?;

    GroupService::lecturer_disband_group(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// Recommendation & Invitations

pub async fn get_recommended_students(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let list = GroupRecommendationService::recommend_students_for_group(
        &state.pool,
        group_id,
        class_id,
        deadline_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Lấy danh sách gợi ý sinh viên cho nhóm thành công".to_string(),
            data: Some(list),
        }),
    ))
}

pub async fn get_recommended_groups(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let list = GroupRecommendationService::recommend_groups_for_student(
        &state.pool,
        auth.id,
        class_id,
        deadline_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Lấy danh sách gợi ý nhóm phù hợp thành công".to_string(),
            data: Some(list),
        }),
    ))
}

pub async fn get_my_pending_invitations(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id)): Path<(i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let list = GroupInvitationService::get_my_pending_invitations(
        &state.pool,
        &auth,
        deadline_id,
        class_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Lấy danh sách lời mời đang chờ thành công".to_string(),
            data: Some(list),
        }),
    ))
}

pub async fn get_group_invitations(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let list = GroupInvitationService::get_group_invitations(
        &state.pool,
        &auth,
        deadline_id,
        class_id,
        group_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Lấy danh sách lời mời của nhóm thành công".to_string(),
            data: Some(list),
        }),
    ))
}

pub async fn search_students_for_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
    Query(query_params): Query<SearchQuery>,
) -> Result<impl IntoResponse, AppError> {
    let list = GroupInvitationService::search_students_for_invite(
        &state.pool,
        &auth,
        deadline_id,
        class_id,
        group_id,
        query_params.query.as_deref(),
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Tìm kiếm sinh viên để mời vào nhóm thành công".to_string(),
            data: Some(list),
        }),
    ))
}

pub async fn send_invitation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, group_id)): Path<(i32, i32, i64)>,
    Json(req): Json<SendInvitationRequest>,
) -> Result<impl IntoResponse, AppError> {
    let inv = GroupInvitationService::send_invitation(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        group_id,
        req,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(RestResponse {
            status_code: 201,
            error: None,
            message: "Gửi lời mời tham gia nhóm thành công".to_string(),
            data: Some(inv),
        }),
    ))
}

pub async fn accept_invitation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, invitation_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let group = GroupInvitationService::accept_invitation(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        invitation_id,
    )
    .await?;
    Ok((
        StatusCode::OK,
        Json(RestResponse {
            status_code: 200,
            error: None,
            message: "Chấp nhận lời mời tham gia nhóm thành công".to_string(),
            data: Some(group),
        }),
    ))
}

pub async fn reject_invitation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, invitation_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    GroupInvitationService::reject_invitation(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        invitation_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn cancel_invitation(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((deadline_id, class_id, invitation_id)): Path<(i32, i32, i64)>,
) -> Result<impl IntoResponse, AppError> {
    GroupInvitationService::cancel_invitation(
        &state.pool,
        &state.event_sender,
        &auth,
        deadline_id,
        class_id,
        invitation_id,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
