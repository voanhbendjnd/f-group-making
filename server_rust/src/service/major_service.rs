use sqlx::MySqlPool;

use crate::dto::major::MajorDTO;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::major_repository::MajorRepository;
use crate::util::major_code;

const ENTITY_NAME: &str = "major";

pub struct MajorService;

impl MajorService {
    pub async fn create_major(pool: &MySqlPool, dto: MajorDTO) -> Result<MajorDTO, AppError> {
        if dto.id.is_some() {
            return Err(AppError::bad_request(
                "A new major cannot have an ID",
                ENTITY_NAME,
                "idexists",
            ));
        }

        let code = Self::normalize_code(&dto.code)?;
        let name = Self::normalize_name(&dto.name)?;
        Self::validate_unique_code_and_name(pool, &code, &name, None).await?;

        let created = MajorRepository::create(pool, &code, &name).await?;
        Ok(MajorDTO {
            id: Some(created.id),
            code: created.code,
            name: created.name,
        })
    }

    pub async fn get_majors(
        pool: &MySqlPool,
        search: Option<String>,
        temporary_name: Option<bool>,
        page: i64,
        size: i64,
    ) -> Result<ResultPaginationDTO<MajorDTO>, AppError> {
        let (majors, total) =
            MajorRepository::find_paginated(pool, search.as_deref(), temporary_name, page, size)
                .await?;

        let dtos = majors
            .into_iter()
            .map(|m| MajorDTO {
                id: Some(m.id),
                code: m.code,
                name: m.name,
            })
            .collect();

        Ok(ResultPaginationDTO::new(dtos, total, page, size))
    }

    pub async fn get_major_by_id(pool: &MySqlPool, id: i32) -> Result<MajorDTO, AppError> {
        let major = MajorRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    format!("Major not found with ID: {}", id),
                    ENTITY_NAME,
                    "majornotfound",
                )
            })?;

        Ok(MajorDTO {
            id: Some(major.id),
            code: major.code,
            name: major.name,
        })
    }

    pub async fn update_major(
        pool: &MySqlPool,
        id: i32,
        dto: MajorDTO,
    ) -> Result<MajorDTO, AppError> {
        if let Some(dto_id) = dto.id {
            if dto_id != id {
                return Err(AppError::bad_request(
                    "Major ID does not match the URL",
                    ENTITY_NAME,
                    "idinvalid",
                ));
            }
        }

        let major = MajorRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    format!("Major not found with ID: {}", id),
                    ENTITY_NAME,
                    "majornotfound",
                )
            })?;

        let code = Self::normalize_code(&dto.code)?;
        let name = Self::normalize_name(&dto.name)?;
        Self::validate_unique_code_and_name(pool, &code, &name, Some(id)).await?;

        if major_code::normalize(&major.code) != code
            && MajorRepository::has_students(pool, id).await?
        {
            return Err(AppError::conflict(
                "Cannot change the code of a major used by students",
                ENTITY_NAME,
                "majorcodeinuse",
            ));
        }

        let updated = MajorRepository::update(pool, id, &code, &name).await?;
        Ok(MajorDTO {
            id: Some(updated.id),
            code: updated.code,
            name: updated.name,
        })
    }

    pub async fn delete_major(pool: &MySqlPool, id: i32) -> Result<(), AppError> {
        let _major = MajorRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    format!("Major not found with ID: {}", id),
                    ENTITY_NAME,
                    "majornotfound",
                )
            })?;

        if MajorRepository::has_students(pool, id).await?
            || MajorRepository::has_major_terms(pool, id).await?
        {
            return Err(AppError::conflict(
                "Cannot delete a major used by students or terms",
                ENTITY_NAME,
                "majorinuse",
            ));
        }

        MajorRepository::delete(pool, id).await
    }

    fn normalize_code(code: &str) -> Result<String, AppError> {
        let normalized = major_code::normalize(code);
        if !major_code::is_valid(&normalized) {
            return Err(AppError::bad_request(
                "Major code must start with a letter or digit and contain only letters, digits or hyphens (1-20 characters)",
                ENTITY_NAME,
                "invalidcode",
            ));
        }
        Ok(normalized)
    }

    fn normalize_name(name: &str) -> Result<String, AppError> {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.len() > 50 {
            return Err(AppError::bad_request(
                "Major name must contain between 1 and 50 characters",
                ENTITY_NAME,
                "invalidname",
            ));
        }
        Ok(trimmed.to_string())
    }

    async fn validate_unique_code_and_name(
        pool: &MySqlPool,
        code: &str,
        name: &str,
        id: Option<i32>,
    ) -> Result<(), AppError> {
        let code_exists = match id {
            None => MajorRepository::exists_by_code_ignore_case(pool, code).await?,
            Some(major_id) => {
                MajorRepository::exists_by_code_ignore_case_and_id_not(pool, code, major_id).await?
            }
        };

        if code_exists {
            return Err(AppError::conflict(
                format!("Major code already exists: {}", code),
                ENTITY_NAME,
                "codeexists",
            ));
        }

        let name_exists = match id {
            None => MajorRepository::exists_by_name_ignore_case(pool, name).await?,
            Some(major_id) => {
                MajorRepository::exists_by_name_ignore_case_and_id_not(pool, name, major_id).await?
            }
        };

        if name_exists {
            return Err(AppError::conflict(
                format!("Major name already exists: {}", name),
                ENTITY_NAME,
                "nameexists",
            ));
        }

        Ok(())
    }
}
