use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub mod config;
pub mod domain;
pub mod dto;
pub mod error;
pub mod handlers;
pub mod repository;
pub mod security;
pub mod service;
pub mod util;

use crate::config::{create_db_pool, AppConfig};
use crate::handlers::{
    account_handler, allocation_handler, class_rule_handler, deadline_handler, group_handler,
    group_review_handler, lecturer_handler, lecturer_profile_handler, major_handler,
    school_class_handler, student_handler, student_profile_handler, term_handler,
    websocket_handler, zalo_share_handler, AppState,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server_rust=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(AppConfig::from_env());
    tracing::info!(
        "Starting {} on port {}",
        config.app_name,
        config.server_port
    );

    let pool = create_db_pool(&config).await?;
    tracing::info!("Connected to database successfully");

    let state = AppState::new(pool, Arc::clone(&config));

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
            axum::http::Method::PATCH,
        ])
        .allow_headers(tower_http::cors::AllowHeaders::mirror_request())
        .allow_credentials(true);

    let app = Router::new()
        // Account & Auth
        .route("/api/login", post(account_handler::login))
        .route(
            "/api/activate",
            post(account_handler::send_request_activate_account),
        )
        .route(
            "/api/activate/mul",
            post(account_handler::send_mul_request_activate_account),
        )
        .route(
            "/api/account/activate/verify",
            get(account_handler::verify_activation_key),
        )
        .route(
            "/api/account/activate",
            post(account_handler::activate_account),
        )
        .route(
            "/api/account/activate/request",
            post(account_handler::request_self_activation),
        )
        .route(
            "/api/account/reset-password/verify",
            get(account_handler::verify_reset_key),
        )
        .route(
            "/api/account/reset-password/init",
            post(account_handler::request_password_reset),
        )
        .route(
            "/api/account/reset-password/finish",
            post(account_handler::finish_password_reset),
        )
        // Terms
        .route(
            "/api/terms",
            get(term_handler::get_terms).post(term_handler::create_term),
        )
        .route("/api/terms/current", get(term_handler::get_current_term))
        // Majors
        .route(
            "/api/majors",
            get(major_handler::get_majors).post(major_handler::create_major),
        )
        .route(
            "/api/majors/{id}",
            get(major_handler::get_major_by_id)
                .put(major_handler::update_major)
                .delete(major_handler::delete_major),
        )
        // School Classes
        .route(
            "/api/school-classes",
            get(school_class_handler::get_all_school_classes),
        )
        .route(
            "/api/school-classes/{id}",
            get(school_class_handler::get_school_class_by_id),
        )
        .route(
            "/api/school-classes/{id}/students",
            get(school_class_handler::get_students_by_class_id),
        )
        .route(
            "/api/school-classes/{id}/lecturer",
            put(school_class_handler::assign_lecturer),
        )
        .route(
            "/api/me/school-classes",
            get(school_class_handler::get_my_classes),
        )
        // Lecturers
        .route(
            "/api/lecturers",
            get(lecturer_handler::get_all_lecturers).post(lecturer_handler::create_lecturer),
        )
        .route(
            "/api/lecturers/import",
            post(lecturer_handler::import_lecturers_from_excel),
        )
        .route(
            "/api/lecturers/activate-all",
            post(lecturer_handler::activate_all_matching),
        )
        .route(
            "/api/lecturers/batch-delete",
            post(lecturer_handler::delete_lecturers_batch),
        )
        .route(
            "/api/lecturers/{userId}",
            delete(lecturer_handler::delete_lecturer),
        )
        .route(
            "/api/me/lecturer-profile",
            get(lecturer_profile_handler::get_current_profile),
        )
        // Students
        .route(
            "/api/students",
            get(student_handler::get_all_students).post(student_handler::create_student),
        )
        .route(
            "/api/students/{userId}",
            get(student_handler::get_student_by_user_id),
        )
        .route(
            "/api/students/activate/all",
            post(student_handler::activate_all_students),
        )
        .route(
            "/api/students/import",
            post(student_handler::import_students_from_excel),
        )
        // Student Profile
        .route(
            "/api/me/student-profile",
            get(student_profile_handler::get_current_profile),
        )
        .route(
            "/api/me/student-profile/bio",
            put(student_profile_handler::update_bio).delete(student_profile_handler::delete_bio),
        )
        // Class Rules
        .route(
            "/api/school-classes/{classId}/rules",
            get(class_rule_handler::get_rules).put(class_rule_handler::save_rules),
        )
        // Class Grouping Session
        .route(
            "/api/school-classes/{classId}/grouping-session",
            put(deadline_handler::ensure_grouping_session),
        )
        // Deadlines
        .route(
            "/api/deadlines",
            get(deadline_handler::get_deadlines).post(deadline_handler::create_deadline),
        )
        .route(
            "/api/deadlines/my-activities",
            get(deadline_handler::get_my_activities),
        )
        .route(
            "/api/deadlines/{id}",
            get(deadline_handler::get_deadline_by_id)
                .put(deadline_handler::update_deadline)
                .delete(deadline_handler::delete_deadline),
        )
        .route(
            "/api/deadlines/{id}/validate",
            get(deadline_handler::validate_deadline),
        )
        .route(
            "/api/deadlines/{id}/close",
            post(deadline_handler::close_deadline),
        )
        // Group Reviews
        .route("/api/me/group-reviews", get(group_review_handler::get_my_group_reviews))
        // Zalo Shares
        .route(
            "/api/school-classes/{classId}/zalo-shares",
            get(zalo_share_handler::get_class_zalo_share).put(zalo_share_handler::save_class_zalo_share),
        )
        .route(
            "/api/school-classes/{classId}/zalo-shares/{id}",
            delete(zalo_share_handler::delete_class_zalo_share),
        )
        .route(
            "/api/lecturers/{lecturerId}/zalo-share",
            get(zalo_share_handler::get_lecturer_zalo_share).put(zalo_share_handler::save_lecturer_zalo_share),
        )
        .route(
            "/api/lecturers/{lecturerId}/zalo-share/{id}",
            delete(zalo_share_handler::delete_lecturer_zalo_share),
        )
        .route("/api/me/zalo-shares", get(zalo_share_handler::get_mine_zalo_shares))
        .route("/api/zalo-shares/{id}/qr", get(zalo_share_handler::get_qr))
        // Groups & Group Invitations & Workspace & Recommendations
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/workspace",
            get(group_handler::get_workspace),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups",
            post(group_handler::create_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/lecturer-create",
            post(group_handler::lecturer_create_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/recommended-groups",
            get(group_handler::get_recommended_groups),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/my-invitations",
            get(group_handler::get_my_pending_invitations),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/invitations/{invitationId}/accept",
            post(group_handler::accept_invitation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/invitations/{invitationId}/reject",
            post(group_handler::reject_invitation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/invitations/{invitationId}",
            delete(group_handler::cancel_invitation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/recommended-students",
            get(group_handler::get_recommended_students),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/invitations",
            get(group_handler::get_group_invitations).post(group_handler::send_invitation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/search-invitees",
            get(group_handler::search_students_for_invite),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/join",
            post(group_handler::join_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/leave",
            post(group_handler::leave_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/transfer-leader",
            post(group_handler::transfer_leader),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/submit",
            post(group_handler::submit_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/cancel-submit",
            post(group_handler::cancel_submit_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/submit-review",
            post(group_handler::lecturer_submit_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/move-member/{studentId}/to/{targetId}",
            post(group_handler::lecturer_move_member),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/accept",
            post(group_handler::accept_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/reject",
            post(group_handler::reject_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/revoke",
            post(group_handler::revoke_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/members/{studentId}",
            post(group_handler::lecturer_add_member).delete(group_handler::lecturer_remove_member),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/members/{studentId}/set-leader",
            post(group_handler::lecturer_set_leader),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}/lecturer-disband",
            delete(group_handler::lecturer_disband_group),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/groups/{groupId}",
            delete(group_handler::disband_group),
        )
        // Smart Allocation Engine
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/plans/recommendation",
            get(allocation_handler::get_recommendation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/plans",
            get(allocation_handler::list_plans),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/plans/{planId}",
            get(allocation_handler::get_plan_detail),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/apply",
            post(allocation_handler::apply_allocation),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/history",
            get(allocation_handler::list_history),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/history/{runId}",
            get(allocation_handler::get_history_detail),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/overview",
            get(allocation_handler::get_overview),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/setup",
            get(allocation_handler::get_setup),
        )
        .route(
            "/api/deadlines/{deadlineId}/classes/{classId}/allocation/preview",
            post(allocation_handler::preview_allocation),
        )
        // Management & Healthcheck
        .route("/management/health", get(|| async {
            axum::Json(serde_json::json!({ "status": "UP" }))
        }))
        // WebSocket & SockJS STOMP
        .route("/ws", get(websocket_handler::ws_handler))
        .route("/ws/info", get(websocket_handler::sockjs_info))
        .route(
            "/ws/{server_id}/{session_id}/websocket",
            get(websocket_handler::sockjs_ws_handler),
        )
        .route(
            "/ws/{server_id}/{session_id}/xhr",
            post(websocket_handler::sockjs_xhr),
        )
        .route(
            "/ws/{server_id}/{session_id}/xhr_streaming",
            post(websocket_handler::sockjs_xhr),
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state);

    let addr = format!("{}:{}", config.server_host, config.server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on http://{}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
