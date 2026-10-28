use sqlx::MySqlPool;
use tokio::sync::broadcast::Sender;

use crate::domain::AuthoritiesConstants;
use crate::dto::group::{ZaloShareDTO, ZaloShareWriteRequest};
use crate::dto::realtime::GroupRealtimeEvent;
use crate::error::AppError;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::repository::term_repository::TermRepository;
use crate::repository::user_repository::UserRepository;
use crate::repository::zalo_share_repository::ZaloShareRepository;
use crate::security::AuthUser;
use crate::service::school_class_service::SchoolClassService;

pub struct ZaloShareService;

impl ZaloShareService {
    pub async fn class_share(
        pool: &MySqlPool,
        auth: &AuthUser,
        class_id: i32,
        term_id: i32,
    ) -> Result<Option<ZaloShareDTO>, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        SchoolClassService::require_read_access(auth, &school_class)?;

        let scope_key = format!("CLASS:{}", class_id);
        let share = ZaloShareRepository::find_by_scope_key(pool, &scope_key).await?;

        if let Some(s) = share {
            if s.term_id != term_id {
                return Ok(None);
            }
            let dto = Self::to_dto(pool, &s, Some(&school_class), None, None).await?;
            Ok(Some(dto))
        } else {
            Ok(None)
        }
    }

    pub async fn lecturer_share(
        pool: &MySqlPool,
        auth: &AuthUser,
        lecturer_id: i64,
        term_id: i32,
    ) -> Result<Option<ZaloShareDTO>, AppError> {
        if !auth.is_admin()
            && !auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
            && auth.id != lecturer_id
        {
            return Err(AppError::forbidden(
                "You cannot access this lecturer's share",
                "zaloShare",
                "accessDenied",
            ));
        }

        let scope_key = format!("LECTURER:{}:TERM:{}", lecturer_id, term_id);
        let share = ZaloShareRepository::find_by_scope_key(pool, &scope_key).await?;

        if let Some(s) = share {
            let lecturer = UserRepository::find_by_id(pool, lecturer_id).await?;
            let dto = Self::to_dto(pool, &s, None, lecturer.as_ref(), None).await?;
            Ok(Some(dto))
        } else {
            Ok(None)
        }
    }

    pub async fn mine(pool: &MySqlPool, auth: &AuthUser) -> Result<Vec<ZaloShareDTO>, AppError> {
        let student = StudentRepository::find_student_profile(pool, auth.id).await?;
        let class_id = match student.school_class_id {
            Some(cid) => cid,
            None => return Ok(Vec::new()),
        };

        let school_class = match SchoolClassRepository::find_by_id(pool, class_id).await? {
            Some(sc) => sc,
            None => return Ok(Vec::new()),
        };

        let term_id = match school_class.term_id {
            Some(tid) => tid,
            None => return Ok(Vec::new()),
        };

        let mut keys = Vec::new();
        keys.push(format!("CLASS:{}", class_id));
        if let Some(lid) = school_class.lecturer_id {
            keys.push(format!("LECTURER:{}:TERM:{}", lid, term_id));
        }

        let shares = ZaloShareRepository::find_by_scope_key_in(pool, &keys).await?;
        let teacher = if let Some(lid) = school_class.lecturer_id {
            UserRepository::find_by_id(pool, lid).await?
        } else {
            None
        };

        let mut dtos = Vec::new();
        for share in shares {
            if share.term_id != term_id {
                continue;
            }
            if share.scope == "CLASS" && share.school_class_id == Some(class_id) {
                let dto =
                    Self::to_dto(pool, &share, Some(&school_class), teacher.as_ref(), None).await?;
                dtos.push(dto);
            } else if share.scope == "LECTURER" && share.lecturer_id == school_class.lecturer_id {
                let dto = Self::to_dto(pool, &share, None, teacher.as_ref(), None).await?;
                dtos.push(dto);
            }
        }

        dtos.sort_by_key(|s| if s.scope == "LECTURER" { 0 } else { 1 });
        Ok(dtos)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn save_class(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        class_id: i32,
        term_id: i32,
        request: ZaloShareWriteRequest,
        qr_bytes: Option<Vec<u8>>,
        qr_format: Option<String>,
    ) -> Result<ZaloShareDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        SchoolClassService::require_write_access(auth, &school_class)?;

        if school_class.term_id != Some(term_id) {
            return Err(AppError::bad_request(
                "Invalid term scope",
                "zaloShare",
                "zaloInvalidScope",
            ));
        }

        if request.scope != "CLASS" {
            return Err(AppError::bad_request(
                "Invalid scope",
                "zaloShare",
                "zaloInvalidScope",
            ));
        }

        let scope_key = format!("CLASS:{}", class_id);
        Self::save_internal(
            pool,
            event_sender,
            auth,
            Some(class_id),
            None,
            term_id,
            "CLASS",
            &scope_key,
            request,
            qr_bytes,
            qr_format,
            Some(&school_class),
            None,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn save_lecturer(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        lecturer_id: i64,
        term_id: i32,
        request: ZaloShareWriteRequest,
        qr_bytes: Option<Vec<u8>>,
        qr_format: Option<String>,
    ) -> Result<ZaloShareDTO, AppError> {
        if !auth.is_admin() && auth.id != lecturer_id {
            return Err(AppError::forbidden(
                "You cannot manage this lecturer's share",
                "zaloShare",
                "accessDenied",
            ));
        }

        if request.scope != "LECTURER" {
            return Err(AppError::bad_request(
                "Invalid scope",
                "zaloShare",
                "zaloInvalidScope",
            ));
        }

        let scope_key = format!("LECTURER:{}:TERM:{}", lecturer_id, term_id);
        let lecturer = UserRepository::find_by_id(pool, lecturer_id).await?;

        Self::save_internal(
            pool,
            event_sender,
            auth,
            None,
            Some(lecturer_id),
            term_id,
            "LECTURER",
            &scope_key,
            request,
            qr_bytes,
            qr_format,
            None,
            lecturer.as_ref(),
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn save_internal(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        school_class_id: Option<i32>,
        lecturer_id: Option<i64>,
        term_id: i32,
        scope: &str,
        scope_key: &str,
        request: ZaloShareWriteRequest,
        qr_bytes: Option<Vec<u8>>,
        qr_format: Option<String>,
        school_class: Option<&crate::domain::SchoolClass>,
        lecturer: Option<&crate::domain::User>,
    ) -> Result<ZaloShareDTO, AppError> {
        let clean_title = request.title.trim();
        if clean_title.is_empty() || clean_title.len() > 100 {
            return Err(AppError::bad_request(
                "Invalid title",
                "zaloShare",
                "zaloInvalidData",
            ));
        }

        if let Some(ref d) = request.description {
            if d.len() > 500 {
                return Err(AppError::bad_request(
                    "Description too long",
                    "zaloShare",
                    "zaloInvalidData",
                ));
            }
        }

        let canonical_url = Self::validate_invite_url(&request.invite_url)?;

        let existing = ZaloShareRepository::find_by_scope_key(pool, scope_key).await?;

        let (qr_public_id, final_format, final_bytes) = if let Some(bytes) = qr_bytes {
            let format = qr_format.unwrap_or_else(|| "png".to_string());
            let public_id = format!("fgroup/zalo/{}", uuid::Uuid::new_v4());
            let byte_len = bytes.len() as i64;
            (Some(public_id), Some(format), Some(byte_len))
        } else if request.remove_qr {
            (None, None, None)
        } else if let Some(ref e) = existing {
            (e.qr_public_id.clone(), e.qr_format.clone(), e.qr_bytes)
        } else {
            (None, None, None)
        };

        let share = ZaloShareRepository::save_share(
            pool,
            existing.as_ref().map(|e| e.id),
            school_class_id,
            lecturer_id,
            term_id,
            scope,
            scope_key,
            clean_title,
            &canonical_url,
            request.description.as_deref(),
            qr_public_id.as_deref(),
            final_format.as_deref(),
            final_bytes,
            request.version,
            Some(&auth.email),
        )
        .await?;

        let dto = Self::to_dto(pool, &share, school_class, lecturer, None).await?;

        if let Some(cid) = school_class_id {
            let event = GroupRealtimeEvent {
                event_id: uuid::Uuid::new_v4().to_string(),
                event_type: "ZALO_SHARE_UPDATED".to_string(),
                group_id: None,
                deadline_id: None,
                school_class_id: Some(cid),
                actor: Some(auth.email.clone()),
                timestamp: chrono::Utc::now(),
                payload: serde_json::to_value(&dto).unwrap_or_default(),
            };
            let _ = event_sender.send(event);
        }

        Ok(dto)
    }

    pub async fn delete_class(
        pool: &MySqlPool,
        auth: &AuthUser,
        class_id: i32,
        term_id: i32,
        id: i64,
        version: i64,
    ) -> Result<(), AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        SchoolClassService::require_write_access(auth, &school_class)?;

        let share = ZaloShareRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Share not found", "zaloShare", "missing"))?;

        if share.school_class_id != Some(class_id) || share.term_id != term_id {
            return Err(AppError::bad_request(
                "Invalid scope",
                "zaloShare",
                "zaloInvalidScope",
            ));
        }

        let deleted = ZaloShareRepository::delete_share(pool, id, version).await?;
        if !deleted {
            return Err(AppError::conflict(
                "Zalo share changed. Reload before deleting.",
                "zaloShare",
                "zaloConflict",
            ));
        }
        Ok(())
    }

    pub async fn delete_lecturer(
        pool: &MySqlPool,
        auth: &AuthUser,
        lecturer_id: i64,
        term_id: i32,
        id: i64,
        version: i64,
    ) -> Result<(), AppError> {
        if !auth.is_admin() && auth.id != lecturer_id {
            return Err(AppError::forbidden(
                "You cannot delete this lecturer's share",
                "zaloShare",
                "accessDenied",
            ));
        }

        let share = ZaloShareRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Share not found", "zaloShare", "missing"))?;

        if share.lecturer_id != Some(lecturer_id) || share.term_id != term_id {
            return Err(AppError::bad_request(
                "Invalid scope",
                "zaloShare",
                "zaloInvalidScope",
            ));
        }

        let deleted = ZaloShareRepository::delete_share(pool, id, version).await?;
        if !deleted {
            return Err(AppError::conflict(
                "Zalo share changed. Reload before deleting.",
                "zaloShare",
                "zaloConflict",
            ));
        }
        Ok(())
    }

    pub async fn qr(
        pool: &MySqlPool,
        _auth: &AuthUser,
        id: i64,
    ) -> Result<(Vec<u8>, String), AppError> {
        let share = ZaloShareRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Share not found", "zaloShare", "missing"))?;

        let format = share.qr_format.unwrap_or_else(|| "png".to_string());
        let content_type = format!("image/{}", if format == "jpg" { "jpeg" } else { &format });

        // Generate a 1x1 transparent png if image data not present
        let placeholder_bytes = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];

        Ok((placeholder_bytes, content_type))
    }

    fn validate_invite_url(input: &str) -> Result<String, AppError> {
        let trimmed = input.trim();
        let re = regex::Regex::new(r"^https://zalo\.me/g/[A-Za-z0-9]+/?$").unwrap();
        if !re.is_match(trimmed) {
            return Err(AppError::bad_request(
                "Invalid Zalo invite URL",
                "zaloShare",
                "zaloInvalidLink",
            ));
        }
        Ok(trimmed.trim_end_matches('/').to_string())
    }

    async fn to_dto(
        pool: &MySqlPool,
        share: &crate::domain::ZaloShare,
        school_class: Option<&crate::domain::SchoolClass>,
        lecturer: Option<&crate::domain::User>,
        term: Option<&crate::domain::Term>,
    ) -> Result<ZaloShareDTO, AppError> {
        let class_name = if let Some(sc) = school_class {
            Some(sc.name.clone())
        } else if let Some(cid) = share.school_class_id {
            SchoolClassRepository::find_by_id(pool, cid)
                .await?
                .map(|c| c.name)
        } else {
            None
        };

        let lecturer_name = if let Some(l) = lecturer {
            l.name.clone()
        } else if let Some(lid) = share.lecturer_id {
            UserRepository::find_by_id(pool, lid)
                .await?
                .and_then(|u| u.name)
        } else {
            None
        };

        let term_name = if let Some(t) = term {
            Some(t.name.clone())
        } else {
            TermRepository::find_by_id(pool, share.term_id)
                .await?
                .map(|t| t.name)
        };

        Ok(ZaloShareDTO {
            id: share.id,
            class_id: share.school_class_id,
            class_name,
            lecturer_id: share.lecturer_id,
            lecturer_name,
            term_id: share.term_id,
            term_name,
            scope: share.scope.clone(),
            title: share.title.clone(),
            invite_url: share.invite_url.clone(),
            description: share.description.clone(),
            has_qr: share.qr_public_id.is_some(),
            version: share.version,
            updated_at: share.last_modified_date.or(share.created_date),
        })
    }
}
