use crate::error::AppError;
use crate::handlers::AppState;
use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

pub use crate::domain::AuthoritiesConstants;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInsideToken {
    pub id: i64,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub sub: String,
    pub user: UserInsideToken,
    pub authorities: Vec<String>,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub iat: i64,
    pub exp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenClaims {
    pub sub: String,
    pub user: UserInsideToken,
    pub iat: i64,
    pub exp: i64,
}

pub struct SecurityService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    access_token_validity: i64,
    refresh_token_validity: i64,
}

impl SecurityService {
    pub fn new(base64_secret: &str, access_validity: u64, refresh_validity: u64) -> Self {
        let key_bytes = BASE64
            .decode(base64_secret)
            .unwrap_or_else(|_| base64_secret.as_bytes().to_vec());
        let encoding_key = EncodingKey::from_secret(&key_bytes);
        let decoding_key = DecodingKey::from_secret(&key_bytes);

        Self {
            encoding_key,
            decoding_key,
            access_token_validity: access_validity as i64,
            refresh_token_validity: refresh_validity as i64,
        }
    }

    pub fn hash_password(password: &str) -> Result<String, AppError> {
        bcrypt::hash(password, bcrypt::DEFAULT_COST)
            .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))
    }

    pub fn verify_password(password: &str, hash: &str) -> bool {
        bcrypt::verify(password, hash).unwrap_or(false)
    }

    pub fn create_access_token<I>(
        &self,
        user_id: i64,
        email: &str,
        session_id: &str,
        authorities: I,
    ) -> Result<String, AppError>
    where
        I: IntoIterator<Item = String>,
    {
        let now = Utc::now().timestamp();
        let exp = now + self.access_token_validity;

        let claims = AccessTokenClaims {
            sub: email.to_lowercase(),
            user: UserInsideToken {
                id: user_id,
                email: email.to_lowercase(),
            },
            authorities: authorities.into_iter().collect(),
            session_id: session_id.to_string(),
            iat: now,
            exp,
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| AppError::Internal(format!("Failed to encode access token: {}", e)))
    }

    pub fn create_refresh_token(&self, user_id: i64, email: &str) -> Result<String, AppError> {
        let now = Utc::now().timestamp();
        let exp = now + self.refresh_token_validity;

        let claims = RefreshTokenClaims {
            sub: email.to_lowercase(),
            user: UserInsideToken {
                id: user_id,
                email: email.to_lowercase(),
            },
            iat: now,
            exp,
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| AppError::Internal(format!("Failed to encode refresh token: {}", e)))
    }

    pub fn decode_access_token(&self, token: &str) -> Result<AccessTokenClaims, AppError> {
        let mut validation = Validation::default();
        validation.validate_exp = true;

        decode::<AccessTokenClaims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|_| AppError::Unauthorized("Invalid or expired access token".to_string()))
    }
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    SecurityService::hash_password(password)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    SecurityService::verify_password(password, hash)
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub email: String,
    pub session_id: String,
    pub authorities: Vec<String>,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.has_role(AuthoritiesConstants::ADMIN)
    }

    pub fn is_lecturer(&self) -> bool {
        self.has_role(AuthoritiesConstants::LECTURE)
            || self.has_role(AuthoritiesConstants::LECTURE_MASTER)
    }

    pub fn is_student(&self) -> bool {
        self.has_role(AuthoritiesConstants::STUDENT)
    }

    pub fn has_role(&self, role: &str) -> bool {
        self.authorities.iter().any(|a| a == role)
    }

    pub fn require_role(&self, role: &str) -> Result<(), AppError> {
        if self.has_role(role) {
            Ok(())
        } else {
            Err(AppError::forbidden(
                "Access is denied",
                "security",
                "donotpermission",
            ))
        }
    }

    pub fn require_any_role(&self, roles: &[&str]) -> Result<(), AppError> {
        if roles.iter().any(|r| self.has_role(r)) {
            Ok(())
        } else {
            Err(AppError::forbidden(
                "Access is denied",
                "security",
                "donotpermission",
            ))
        }
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|val| val.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?;

        if !auth_header.starts_with("Bearer ") {
            return Err(AppError::Unauthorized(
                "Invalid authorization scheme".to_string(),
            ));
        }

        let token = &auth_header["Bearer ".len()..];
        let claims = state.security.decode_access_token(token)?;

        // Verify session_id against database `users.session_id`
        let db_user: Option<(Option<String>,)> =
            sqlx::query_as("SELECT session_id FROM users WHERE id = ? AND activated = TRUE")
                .bind(claims.user.id)
                .fetch_optional(&state.pool)
                .await
                .map_err(AppError::Database)?;

        match db_user {
            Some((Some(stored_session),)) => {
                if stored_session != claims.session_id {
                    return Err(AppError::SessionInvalid);
                }
            }
            Some((None,)) => {
                // If stored session_id is null, Spring code considers it valid
            }
            None => {
                return Err(AppError::Unauthorized(
                    "User not found or not activated".to_string(),
                ));
            }
        }

        Ok(AuthUser {
            id: claims.user.id,
            email: claims.user.email,
            session_id: claims.session_id,
            authorities: claims.authorities,
        })
    }
}
