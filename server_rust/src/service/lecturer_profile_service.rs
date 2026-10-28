use sqlx::MySqlPool;

use crate::dto::lecturer::LecturerProfileDTO;
use crate::error::AppError;
use crate::repository::lecturer_repository::LecturerRepository;
use crate::repository::user_repository::UserRepository;
use crate::security::AuthUser;

pub struct LecturerProfileService;

impl LecturerProfileService {
    pub async fn get_current_profile(
        pool: &MySqlPool,
        auth: &AuthUser,
    ) -> Result<LecturerProfileDTO, AppError> {
        let user = UserRepository::find_by_id(pool, auth.id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("User not found", "lecturerProfile", "profileNotFound")
            })?;

        let lecturer = LecturerRepository::find_by_id(pool, user.id).await?;
        let code = lecturer.as_ref().map(|l| l.code.clone());
        let profile_complete =
            lecturer.is_some() && code.as_ref().map(|c| !c.trim().is_empty()).unwrap_or(false);

        Ok(LecturerProfileDTO {
            name: user.name,
            code,
            email: user.email,
            activated: user.activated,
            profile_complete,
        })
    }
}
