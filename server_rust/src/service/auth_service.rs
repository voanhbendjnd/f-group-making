use sqlx::MySqlPool;
use uuid::Uuid;

use crate::dto::auth::{LoginVM, ResLoginDTO, UserLogin};
use crate::error::AppError;
use crate::repository::user_repository::UserRepository;
use crate::security::{verify_password, SecurityService};

pub struct AuthService;

impl AuthService {
    pub async fn login(
        pool: &MySqlPool,
        security: &SecurityService,
        vm: LoginVM,
    ) -> Result<(ResLoginDTO, String), AppError> {
        let normalized_email = vm.username.trim().to_lowercase();
        if normalized_email.is_empty() || vm.password.is_empty() {
            return Err(AppError::BadCredentials);
        }

        let user = UserRepository::find_by_email(pool, &normalized_email)
            .await?
            .ok_or(AppError::BadCredentials)?;

        let password_hash = user.password_hash.as_deref().unwrap_or("");
        if !verify_password(&vm.password, password_hash) {
            return Err(AppError::BadCredentials);
        }

        if !user.activated {
            return Err(AppError::BadCredentials);
        }

        let authorities = UserRepository::find_authorities_by_user_id(pool, user.id).await?;

        let session_id = Uuid::new_v4().to_string();
        UserRepository::update_session_id(pool, user.id, &session_id).await?;

        let access_token =
            security.create_access_token(user.id, &user.email, &session_id, authorities.clone())?;

        let refresh_token = security.create_refresh_token(user.id, &user.email)?;
        let rows_affected =
            UserRepository::update_refresh_token(pool, user.id, &refresh_token).await?;

        if rows_affected == 0 {
            return Err(AppError::not_found(
                format!("User with ID [{}] not found", user.id),
                "userManagement",
                "idnotfound",
            ));
        }

        let res = ResLoginDTO {
            access_token,
            refresh_token: None,
            user: UserLogin {
                id: user.id,
                email: user.email,
                name: user.name,
                authorities,
            },
        };

        Ok((res, refresh_token))
    }
}
