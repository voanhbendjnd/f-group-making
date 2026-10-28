use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::domain::AuthoritiesConstants;
use crate::dto::auth::{
    ActivateAccountVM, BatchActivationResultDTO, KeyAndPasswordVM, LoginVM, MulUserId,
    ResetPasswordInitVM,
};
use crate::dto::RestResponse;
use crate::error::AppError;
use crate::handlers::AppState;
use crate::security::AuthUser;
use crate::service::auth_service::AuthService;
use crate::service::term_service::TermService;
use crate::service::user_service::UserService;

#[derive(Debug, Deserialize)]
pub struct TermIdQuery {
    #[serde(rename = "termId")]
    pub term_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct KeyQuery {
    pub key: Option<String>,
}

pub async fn login(
    State(state): State<AppState>,
    Json(vm): Json<LoginVM>,
) -> Result<impl IntoResponse, AppError> {
    let (res_login, raw_refresh_token) =
        AuthService::login(&state.pool, &state.security, vm).await?;

    let cookie_val = format!(
        "refresh_token={}; HttpOnly; Secure; Path=/; Max-Age={}; SameSite=Strict",
        raw_refresh_token, state.config.jwt_refresh_token_validity_seconds
    );

    let mut headers = HeaderMap::new();
    if let Ok(val) = HeaderValue::from_str(&cookie_val) {
        headers.insert(header::SET_COOKIE, val);
    }

    let response_body = RestResponse::success(res_login, "Call API success!");
    Ok((headers, Json(response_body)))
}

pub async fn send_request_activate_account(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(term_query): Query<TermIdQuery>,
    body: Option<Json<Value>>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let payload = body.map(|Json(v)| v).unwrap_or(Value::Null);

    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let raw_user_id = payload
        .get("userId")
        .or_else(|| payload.get("id"))
        .and_then(|v| {
            if let Some(n) = v.as_i64() {
                Some(n)
            } else if let Some(s) = v.as_str() {
                s.parse::<i64>().ok()
            } else {
                None
            }
        });

    let dto = if let Some(user_id) = raw_user_id {
        TermService::validate_user_ids_in_term(&state.pool, &[user_id], term_query.term_id).await?;
        UserService::init_activated_key_account_by_id(&state.pool, Some(user_id)).await?
    } else if let Some(ref em) = email {
        if em.trim().is_empty() {
            return Err(AppError::bad_request(
                "Email not found",
                "userManagement",
                "emailnotfound",
            ));
        }
        TermService::validate_email_in_term(&state.pool, em, term_query.term_id).await?;
        UserService::init_activated_key_account(&state.pool, em).await?
    } else {
        return Err(AppError::bad_request(
            "Email not found",
            "userManagement",
            "emailnotfound",
        ));
    };

    state.mail_service.send_activation_email(&dto).await;

    Ok(Json(RestResponse::success(
        Value::Null,
        "Activation email request accepted successfully",
    )))
}

pub async fn send_mul_request_activate_account(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(term_query): Query<TermIdQuery>,
    body: Option<Json<MulUserId>>,
) -> Result<impl IntoResponse, AppError> {
    auth.require_role(AuthoritiesConstants::ADMIN)?;

    let mul = body.ok_or_else(|| {
        AppError::bad_request("User IDs must not be empty", "userManagement", "invalidids")
    })?;

    if mul.user_ids.is_empty() || mul.user_ids.iter().any(|&id| id <= 0) {
        return Err(AppError::bad_request(
            "User IDs must not be empty or contain null values",
            "userManagement",
            "invalidids",
        ));
    }

    let mut distinct_ids = mul.user_ids.clone();
    distinct_ids.sort_unstable();
    distinct_ids.dedup();

    TermService::validate_user_ids_in_term(&state.pool, &distinct_ids, term_query.term_id).await?;

    let users_to_activate =
        UserService::init_activate_key_mul_account(&state.pool, &distinct_ids).await?;

    for user in &users_to_activate {
        state.mail_service.send_activation_email(user).await;
    }

    let result = BatchActivationResultDTO {
        total_requested: distinct_ids.len(),
        total_processed: users_to_activate.len(),
        total_skipped_already_active: distinct_ids.len().saturating_sub(users_to_activate.len()),
        sent_emails: users_to_activate.into_iter().map(|u| u.email).collect(),
    };

    Ok(Json(RestResponse::success(
        result,
        "Batch activation request accepted successfully",
    )))
}

pub async fn verify_activation_key(
    State(state): State<AppState>,
    Query(query): Query<KeyQuery>,
) -> Result<impl IntoResponse, AppError> {
    let key = query.key.unwrap_or_default();
    let result = UserService::verify_activation_key(&state.pool, &key).await?;
    Ok(Json(RestResponse::success(
        result,
        "Activation key verified successfully",
    )))
}

pub async fn activate_account(
    State(state): State<AppState>,
    Json(vm): Json<ActivateAccountVM>,
) -> Result<impl IntoResponse, AppError> {
    UserService::activate_account_and_set_password(&state.pool, &vm.key, &vm.password).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn request_self_activation(
    State(state): State<AppState>,
    Json(vm): Json<ResetPasswordInitVM>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(user_dto) = UserService::request_account_activation(&state.pool, &vm.email).await? {
        state.mail_service.send_activation_email(&user_dto).await;
    }

    Ok(Json(RestResponse::success(
        Value::Null,
        "If the email is valid and eligible, activation instructions have been sent.",
    )))
}

pub async fn verify_reset_key(
    State(state): State<AppState>,
    Query(query): Query<KeyQuery>,
) -> Result<impl IntoResponse, AppError> {
    let key = query.key.unwrap_or_default();
    let result = UserService::verify_reset_key(&state.pool, &key).await?;
    Ok(Json(RestResponse::success(
        result,
        "Reset key verified successfully",
    )))
}

pub async fn request_password_reset(
    State(state): State<AppState>,
    Json(vm): Json<ResetPasswordInitVM>,
) -> Result<impl IntoResponse, AppError> {
    let trimmed = vm.email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') {
        return Err(AppError::bad_request(
            "Invalid email format",
            "userManagement",
            "emailinvalid",
        ));
    }

    if let Some(user_dto) = UserService::request_password_reset(&state.pool, trimmed).await? {
        state.mail_service.send_password_reset_mail(&user_dto).await;
    }

    Ok(Json(RestResponse::success(
        Value::Null,
        "Password reset request accepted",
    )))
}

pub async fn finish_password_reset(
    State(state): State<AppState>,
    Json(vm): Json<KeyAndPasswordVM>,
) -> Result<impl IntoResponse, AppError> {
    let user =
        UserService::complete_password_reset(&state.pool, &vm.new_password, &vm.reset_key).await?;

    if user.is_none() {
        return Err(AppError::bad_request(
            "Reset key is invalid or expired",
            "userManagement",
            "resetkeyinvalidorexpired",
        ));
    }

    Ok(Json(RestResponse::success(
        Value::Null,
        "Password has been reset successfully",
    )))
}
