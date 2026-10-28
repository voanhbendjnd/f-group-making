use axum::{
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const DEFAULT_PROBLEM_TYPE: &str = "https://www.jhipster.tech/problem/problem-with-message";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldError {
    pub object_name: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Violation {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemDetails {
    pub r#type: String,
    pub title: String,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_key: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub field_errors: Vec<FieldError>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub violations: Vec<Violation>,
}

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Bad Request: {message}")]
    BadRequest {
        message: String,
        entity_name: String,
        error_key: String,
        detail: Option<String>,
    },

    #[error("Not Found: {message}")]
    NotFound {
        message: String,
        entity_name: String,
        error_key: String,
    },

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Bad Credentials")]
    BadCredentials,

    #[error("Session Invalid")]
    SessionInvalid,

    #[error("Forbidden: {message}")]
    Forbidden {
        message: String,
        entity_name: String,
        error_key: String,
        detail: Option<String>,
    },

    #[error("Conflict: {message}")]
    Conflict {
        message: String,
        entity_name: String,
        error_key: String,
        detail: Option<String>,
    },

    #[error("Unprocessable Entity: {message}")]
    UnprocessableEntity {
        message: String,
        entity_name: String,
        error_key: String,
        detail: Option<String>,
    },

    #[error("Validation Error")]
    Validation(Vec<Violation>),

    #[error("Email Already Used")]
    EmailAlreadyUsed,

    #[error("Login Already Used")]
    LoginAlreadyUsed,

    #[error("Database Error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Internal Server Error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn bad_request(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self::BadRequest {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: None,
        }
    }

    pub fn bad_request_with_detail(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self::BadRequest {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn not_found(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self::NotFound {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
        }
    }

    pub fn forbidden(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self::Forbidden {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: None,
        }
    }

    pub fn conflict(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self::Conflict {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: None,
        }
    }

    pub fn conflict_with_detail(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self::Conflict {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn unprocessable(
        msg: impl Into<String>,
        entity: impl Into<String>,
        key: impl Into<String>,
    ) -> Self {
        Self::UnprocessableEntity {
            message: msg.into(),
            entity_name: entity.into(),
            error_key: key.into(),
            detail: None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let problem_type = match &self {
            AppError::BadCredentials => "/invalid-password".to_string(),
            _ => DEFAULT_PROBLEM_TYPE.to_string(),
        };

        let (status, title, message, entity_name, error_key, detail, violations) = match self {
            AppError::BadRequest {
                message,
                entity_name,
                error_key,
                detail,
            } => (
                StatusCode::BAD_REQUEST,
                "Bad Request".to_string(),
                Some(format!("error.{}", error_key)),
                Some(entity_name),
                Some(error_key),
                detail.or(Some(message)),
                vec![],
            ),
            AppError::NotFound {
                message,
                entity_name,
                error_key,
            } => (
                StatusCode::NOT_FOUND,
                "Not Found".to_string(),
                Some(format!("error.{}", error_key)),
                Some(entity_name),
                Some(error_key),
                Some(message),
                vec![],
            ),
            AppError::Unauthorized(msg) => (
                StatusCode::UNAUTHORIZED,
                "Unauthorized".to_string(),
                Some("error.http.401".to_string()),
                None,
                Some("Unauthorized".to_string()),
                Some(msg),
                vec![],
            ),
            AppError::BadCredentials => (
                StatusCode::UNAUTHORIZED,
                "Unauthorized".to_string(),
                Some("Bad credentials".to_string()),
                None,
                Some("Bad credentials".to_string()),
                Some("Bad credentials".to_string()),
                vec![],
            ),
            AppError::SessionInvalid => (
                StatusCode::UNAUTHORIZED,
                "Unauthorized".to_string(),
                Some("error.sessioninvalid".to_string()),
                Some("userManagement".to_string()),
                Some("sessioninvalid".to_string()),
                Some("Session invalid or expired".to_string()),
                vec![],
            ),
            AppError::Forbidden {
                message,
                entity_name,
                error_key,
                detail,
            } => (
                StatusCode::FORBIDDEN,
                "Forbidden".to_string(),
                Some(format!("error.{}", error_key)),
                Some(entity_name),
                Some(error_key),
                detail.or(Some(message)),
                vec![],
            ),
            AppError::Conflict {
                message,
                entity_name,
                error_key,
                detail,
            } => (
                StatusCode::CONFLICT,
                "Conflict".to_string(),
                Some(format!("error.{}", error_key)),
                Some(entity_name),
                Some(error_key),
                detail.or(Some(message)),
                vec![],
            ),
            AppError::UnprocessableEntity {
                message,
                entity_name,
                error_key,
                detail,
            } => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "Unprocessable Entity".to_string(),
                Some(format!("error.{}", error_key)),
                Some(entity_name),
                Some(error_key),
                detail.or(Some(message)),
                vec![],
            ),
            AppError::Validation(v) => (
                StatusCode::BAD_REQUEST,
                "Constraint Violation".to_string(),
                Some("error.validation".to_string()),
                None,
                None,
                None,
                v,
            ),
            AppError::EmailAlreadyUsed => (
                StatusCode::BAD_REQUEST,
                "Email is already in use!".to_string(),
                Some("error.emailexists".to_string()),
                Some("userManagement".to_string()),
                Some("emailexists".to_string()),
                Some("Email is already in use!".to_string()),
                vec![],
            ),
            AppError::LoginAlreadyUsed => (
                StatusCode::BAD_REQUEST,
                "Login name already used!".to_string(),
                Some("error.userexists".to_string()),
                Some("userManagement".to_string()),
                Some("userexists".to_string()),
                Some("Login name already used!".to_string()),
                vec![],
            ),
            AppError::Database(err) => {
                tracing::error!("Database error: {:?}", err);
                if let sqlx::Error::Database(db_err) = &err {
                    // Check duplicate entry error code (MySQL 1062)
                    if db_err.code().as_deref() == Some("23000")
                        || db_err.message().contains("Duplicate entry")
                    {
                        (
                            StatusCode::CONFLICT,
                            "Data changed or conflicts with an existing record. Reload and retry the request.".to_string(),
                            Some("error.dataconflict".to_string()),
                            Some("data".to_string()),
                            Some("dataconflict".to_string()),
                            Some(db_err.message().to_string()),
                            vec![],
                        )
                    } else {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Internal Server Error".to_string(),
                            Some("error.http.500".to_string()),
                            None,
                            None,
                            Some("Database error occurred".to_string()),
                            vec![],
                        )
                    }
                } else {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Internal Server Error".to_string(),
                        Some("error.http.500".to_string()),
                        None,
                        None,
                        Some("Database error occurred".to_string()),
                        vec![],
                    )
                }
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error".to_string(),
                    Some("error.http.500".to_string()),
                    None,
                    None,
                    Some(msg),
                    vec![],
                )
            }
        };

        let problem = ProblemDetails {
            r#type: problem_type,
            title: title.clone(),

            status: status.as_u16(),
            detail,
            path: None,
            message,
            entity_name: entity_name.clone(),
            error_key: error_key.clone(),
            field_errors: vec![],
            violations,
        };

        let mut res = (status, Json(problem)).into_response();
        res.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        );

        if let (Some(entity), Some(key)) = (entity_name, error_key) {
            if let Ok(alert) = HeaderValue::from_str(&format!("{}.{}", entity, key)) {
                res.headers_mut().insert("X-djndApp-error", alert.clone());
                res.headers_mut().insert("X-djndApp-params", alert);
            }
        }

        res
    }
}
