use sqlx::MySqlPool;

use crate::dto::school_class::SchoolClassDTO;
use crate::dto::student::StudentDTO;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::lecturer_repository::LecturerRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::security::AuthUser;
use crate::service::term_service::TermService;

pub struct SchoolClassService;

impl SchoolClassService {
    pub async fn assign_lecturer(
        pool: &MySqlPool,
        class_id: i32,
        lecturer_id: i64,
        expected_lecturer_id: Option<i64>,
    ) -> Result<SchoolClassDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id_for_update(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        if school_class.lecturer_id != expected_lecturer_id {
            return Err(AppError::conflict(
                "The class lecturer has changed",
                "schoolClass",
                "lecturerAssignmentConflict",
            ));
        }

        if lecturer_id <= 0 {
            return Err(AppError::bad_request(
                "A positive lecturer ID is required",
                "schoolClass",
                "invalidLecturerId",
            ));
        }

        if !LecturerRepository::exists_by_id(pool, lecturer_id).await? {
            return Err(AppError::not_found(
                "Lecturer not found",
                "schoolClass",
                "lecturerNotFound",
            ));
        }

        if school_class.lecturer_id != Some(lecturer_id) {
            SchoolClassRepository::assign_lecturer(pool, class_id, lecturer_id).await?;
        }

        SchoolClassRepository::find_class_dto_by_id(pool, class_id)
            .await?
            .ok_or_else(|| AppError::not_found("Class not found", "schoolClass", "classNotFound"))
    }

    pub async fn get_school_classes(
        pool: &MySqlPool,
        search: Option<String>,
        term_id: Option<i32>,
        page: i64,
        size: i64,
    ) -> Result<ResultPaginationDTO<SchoolClassDTO>, AppError> {
        TermService::validate_term(pool, term_id).await?;
        let (dtos, total) = SchoolClassRepository::search_classes(
            pool,
            search.as_deref(),
            term_id,
            None,
            page,
            size,
        )
        .await?;

        Ok(ResultPaginationDTO::new(dtos, total, page, size))
    }

    pub async fn get_my_school_classes(
        pool: &MySqlPool,
        search: Option<String>,
        term_id: Option<i32>,
        lecturer_id: i64,
        page: i64,
        size: i64,
    ) -> Result<ResultPaginationDTO<SchoolClassDTO>, AppError> {
        TermService::validate_term(pool, term_id).await?;
        let (dtos, total) = SchoolClassRepository::search_classes(
            pool,
            search.as_deref(),
            term_id,
            Some(lecturer_id),
            page,
            size,
        )
        .await?;

        Ok(ResultPaginationDTO::new(dtos, total, page, size))
    }

    pub async fn get_school_class_by_id(
        pool: &MySqlPool,
        class_id: i32,
        auth: &AuthUser,
    ) -> Result<SchoolClassDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        Self::require_read_access(auth, &school_class)?;

        SchoolClassRepository::find_class_dto_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::bad_request(
                    format!("Lớp học không tồn tại với ID: {}", class_id),
                    "schoolClassManagement",
                    "classNotFound",
                )
            })
    }

    pub async fn get_students_by_class_id(
        pool: &MySqlPool,
        class_id: i32,
        auth: &AuthUser,
    ) -> Result<Vec<StudentDTO>, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        Self::require_read_access(auth, &school_class)?;

        StudentRepository::find_students_by_school_class_id(pool, class_id).await
    }

    pub fn require_read_access(
        auth: &AuthUser,
        school_class: &crate::domain::SchoolClass,
    ) -> Result<(), AppError> {
        if auth.is_admin() || auth.has_role(crate::domain::AuthoritiesConstants::LECTURE_MASTER) {
            return Ok(());
        }

        if school_class.lecturer_id == Some(auth.id) {
            return Ok(());
        }

        Err(AppError::forbidden(
            "You cannot manage this class.",
            "schoolClass",
            "classAccessDenied",
        ))
    }

    pub fn require_write_access(
        auth: &AuthUser,
        school_class: &crate::domain::SchoolClass,
    ) -> Result<(), AppError> {
        if auth.is_admin() {
            return Ok(());
        }

        if school_class.lecturer_id == Some(auth.id) {
            return Ok(());
        }

        Err(AppError::forbidden(
            "You cannot manage this class.",
            "schoolClass",
            "classAccessDenied",
        ))
    }
}
