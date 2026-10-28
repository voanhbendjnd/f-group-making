use chrono::{DateTime, Duration, Utc};
use sqlx::MySqlPool;

use crate::domain::{AuthoritiesConstants, User};
use crate::dto::auth::{ActivationKeyVerifyDTO, ResetKeyVerifyDTO, UserDTO};
use crate::error::AppError;
use crate::repository::user_repository::UserRepository;
use crate::security::hash_password;
use crate::util::random_utils::{generate_activation_key, generate_reset_key};

pub const ACTIVATION_KEY_VALIDITY_DAYS: i64 = 3;
pub const PASSWORD_MIN_LENGTH: usize = 4;
pub const PASSWORD_MAX_LENGTH: usize = 100;

pub struct UserService;

impl UserService {
    pub async fn init_activated_key_account(
        pool: &MySqlPool,
        email: &str,
    ) -> Result<UserDTO, AppError> {
        let normalized_email = email.trim().to_lowercase();
        let user = UserRepository::find_by_email(pool, &normalized_email)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    format!("Email '{}' not found", normalized_email),
                    "userManagement",
                    "emailnotfound",
                )
            })?;

        if user.activated {
            return Err(AppError::forbidden(
                "account",
                "userManagement",
                "alreadyactivated",
            ));
        }

        let key = generate_activation_key();
        let expires_at = Utc::now() + Duration::days(ACTIVATION_KEY_VALIDITY_DAYS);
        UserRepository::assign_activation_key(pool, user.id, &key, expires_at).await?;

        Ok(UserDTO {
            id: Some(user.id),
            name: user.name,
            email: normalized_email,
            activation_key: Some(key),
            activated: false,
            ..Default::default()
        })
    }

    pub async fn init_activated_key_account_by_id(
        pool: &MySqlPool,
        user_id: Option<i64>,
    ) -> Result<UserDTO, AppError> {
        let id = user_id.ok_or_else(|| {
            AppError::bad_request("User ID must not be null", "userManagement", "idnull")
        })?;

        let user = UserRepository::find_by_id(pool, id).await?.ok_or_else(|| {
            AppError::bad_request("User not found", "userManagement", "usernotfound")
        })?;

        if user.activated {
            return Err(AppError::bad_request(
                "User is already activated",
                "userManagement",
                "alreadyactivated",
            ));
        }

        let key = generate_activation_key();
        let expires_at = Utc::now() + Duration::days(ACTIVATION_KEY_VALIDITY_DAYS);
        UserRepository::assign_activation_key(pool, user.id, &key, expires_at).await?;

        Ok(UserDTO {
            id: Some(user.id),
            name: user.name,
            email: user.email,
            activation_key: Some(key),
            activated: false,
            ..Default::default()
        })
    }

    pub async fn init_activate_key_mul_account(
        pool: &MySqlPool,
        user_ids: &[i64],
    ) -> Result<Vec<UserDTO>, AppError> {
        if user_ids.is_empty() || user_ids.iter().any(|&id| id <= 0) {
            return Err(AppError::bad_request(
                "User IDs must not be empty or contain null values",
                "userManagement",
                "invalidids",
            ));
        }

        let mut distinct_ids = user_ids.to_vec();
        distinct_ids.sort_unstable();
        distinct_ids.dedup();

        let current_users = UserRepository::find_by_ids(pool, &distinct_ids).await?;
        if current_users.len() != distinct_ids.len() {
            return Err(AppError::bad_request(
                "One or more user IDs were not found",
                "userManagement",
                "idnotfound",
            ));
        }

        let users_pending: Vec<User> = current_users.into_iter().filter(|u| !u.activated).collect();

        if users_pending.is_empty() {
            return Ok(Vec::new());
        }

        let mut dtos = Vec::with_capacity(users_pending.len());
        let expires_at = Utc::now() + Duration::days(ACTIVATION_KEY_VALIDITY_DAYS);

        for user in users_pending {
            let key = generate_activation_key();
            UserRepository::assign_activation_key(pool, user.id, &key, expires_at).await?;
            dtos.push(UserDTO {
                id: Some(user.id),
                name: user.name,
                email: user.email,
                activation_key: Some(key),
                activated: false,
                ..Default::default()
            });
        }

        Ok(dtos)
    }

    pub async fn request_account_activation(
        pool: &MySqlPool,
        email: &str,
    ) -> Result<Option<UserDTO>, AppError> {
        let trimmed = email.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let normalized_email = trimmed.to_lowercase();
        let user = match UserRepository::find_by_email(pool, &normalized_email).await? {
            Some(u) => u,
            None => return Ok(None),
        };

        if user.activated {
            return Ok(None);
        }

        let key = generate_activation_key();
        let expires_at = Utc::now() + Duration::days(ACTIVATION_KEY_VALIDITY_DAYS);
        UserRepository::assign_activation_key(pool, user.id, &key, expires_at).await?;

        Ok(Some(UserDTO {
            id: Some(user.id),
            name: user.name,
            email: user.email,
            activation_key: Some(key),
            activated: false,
            ..Default::default()
        }))
    }

    pub async fn verify_activation_key(
        pool: &MySqlPool,
        key: &str,
    ) -> Result<ActivationKeyVerifyDTO, AppError> {
        let trimmed_key = key.trim();
        if trimmed_key.is_empty() {
            return Err(AppError::bad_request(
                "Activation key must not be blank",
                "userManagement",
                "invalidactivationkey",
            ));
        }

        let now = Utc::now();
        let user = UserRepository::find_by_activation_key(pool, trimmed_key)
            .await?
            .filter(|u| !u.activated)
            .filter(|u| Self::is_activation_key_valid(u, now))
            .ok_or_else(|| {
                AppError::bad_request(
                    "Activation key is invalid or expired",
                    "userManagement",
                    "invalidactivationkey",
                )
            })?;

        Ok(ActivationKeyVerifyDTO {
            valid: true,
            email: user.email,
            name: user.name,
        })
    }

    pub async fn activate_account_and_set_password(
        pool: &MySqlPool,
        key: &str,
        password: &str,
    ) -> Result<(), AppError> {
        if password.len() < PASSWORD_MIN_LENGTH || password.len() > PASSWORD_MAX_LENGTH {
            return Err(AppError::bad_request(
                "Password length is invalid",
                "userManagement",
                "passwordlengthinvalid",
            ));
        }

        let trimmed_key = key.trim();
        if trimmed_key.is_empty() {
            return Err(AppError::bad_request(
                "Activation key is invalid or expired",
                "userManagement",
                "invalidactivationkey",
            ));
        }

        let now = Utc::now();
        let user = UserRepository::find_by_activation_key(pool, trimmed_key)
            .await?
            .filter(|u| !u.activated)
            .filter(|u| Self::is_activation_key_valid(u, now))
            .ok_or_else(|| {
                AppError::bad_request(
                    "Activation key is invalid or expired",
                    "userManagement",
                    "invalidactivationkey",
                )
            })?;

        let hashed = hash_password(password)?;
        UserRepository::activate_and_set_password(pool, user.id, &hashed).await?;

        let authorities = UserRepository::find_authorities_by_user_id(pool, user.id).await?;
        if authorities.is_empty() {
            UserRepository::add_authority(pool, user.id, AuthoritiesConstants::STUDENT).await?;
        }

        Ok(())
    }

    pub async fn verify_reset_key(
        pool: &MySqlPool,
        key: &str,
    ) -> Result<ResetKeyVerifyDTO, AppError> {
        let trimmed_key = key.trim();
        if trimmed_key.is_empty() {
            return Err(AppError::bad_request(
                "Reset key must not be blank",
                "userManagement",
                "resetkeyinvalidorexpired",
            ));
        }

        let now = Utc::now();
        let user = UserRepository::find_by_reset_key(pool, trimmed_key)
            .await?
            .filter(|u| u.activated)
            .filter(|u| {
                u.reset_date
                    .map(|d| d > now - Duration::days(1))
                    .unwrap_or(false)
            })
            .ok_or_else(|| {
                AppError::bad_request(
                    "Reset key is invalid or expired",
                    "userManagement",
                    "resetkeyinvalidorexpired",
                )
            })?;

        Ok(ResetKeyVerifyDTO {
            valid: true,
            email: user.email,
            name: user.name,
        })
    }

    pub async fn request_password_reset(
        pool: &MySqlPool,
        email: &str,
    ) -> Result<Option<UserDTO>, AppError> {
        let trimmed = email.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let normalized_email = trimmed.to_lowercase();
        let user = match UserRepository::find_by_email(pool, &normalized_email).await? {
            Some(u) => u,
            None => return Ok(None),
        };

        if !user.activated {
            return Ok(None);
        }

        // Rate limit: 60 seconds cooldown
        let now = Utc::now();
        if let Some(reset_date) = user.reset_date {
            if reset_date > now - Duration::seconds(60) {
                return Ok(None);
            }
        }

        let key = generate_reset_key();
        UserRepository::update_reset_key(pool, user.id, &key, now).await?;

        Ok(Some(UserDTO {
            id: Some(user.id),
            name: user.name,
            email: user.email,
            reset_key: Some(key),
            activated: true,
            ..Default::default()
        }))
    }

    pub async fn complete_password_reset(
        pool: &MySqlPool,
        new_password: &str,
        reset_key: &str,
    ) -> Result<Option<User>, AppError> {
        let trimmed_key = reset_key.trim();
        if trimmed_key.is_empty() {
            return Ok(None);
        }

        if new_password.len() < PASSWORD_MIN_LENGTH || new_password.len() > PASSWORD_MAX_LENGTH {
            return Err(AppError::bad_request(
                "Password length is invalid",
                "userManagement",
                "passwordlengthinvalid",
            ));
        }

        let now = Utc::now();
        let user = match UserRepository::find_by_reset_key(pool, trimmed_key).await? {
            Some(u) => u,
            None => return Ok(None),
        };

        let valid = user
            .reset_date
            .map(|d| d > now - Duration::days(1))
            .unwrap_or(false);

        if !valid {
            return Ok(None);
        }

        let hashed = hash_password(new_password)?;
        UserRepository::complete_password_reset(pool, user.id, &hashed).await?;

        Ok(Some(user))
    }

    fn is_activation_key_valid(user: &User, now: DateTime<Utc>) -> bool {
        let mut expires_at = user.activation_key_expires_at;
        if expires_at.is_none() {
            if let Some(last_modified) = user.last_modified_date {
                expires_at = Some(last_modified + Duration::days(ACTIVATION_KEY_VALIDITY_DAYS));
            }
        }

        expires_at.map(|exp| exp > now).unwrap_or(false)
    }
}
