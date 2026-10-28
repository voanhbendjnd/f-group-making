use chrono::Utc;
use sqlx::MySqlPool;
use uuid::Uuid;

use crate::dto::realtime::GroupRealtimeEvent;
use crate::dto::student::{ProfileInfo, StudentProfileDTO};
use crate::error::AppError;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::GroupRepository;
use crate::repository::major_repository::MajorRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::repository::term_repository::TermRepository;
use crate::repository::user_repository::UserRepository;

pub struct StudentProfileService;

impl StudentProfileService {
    pub async fn get_current_profile(
        pool: &MySqlPool,
        user_id: i64,
    ) -> Result<StudentProfileDTO, AppError> {
        let user = UserRepository::find_by_id(pool, user_id)
            .await?
            .ok_or_else(Self::not_found)?;

        let student = StudentRepository::find_by_id(pool, user_id)
            .await?
            .ok_or_else(Self::not_found)?;

        let major_info = if student.major_id <= 0 {
            Self::unassigned()
        } else {
            match MajorRepository::find_by_id(pool, student.major_id).await? {
                Some(m) => Self::available(&m.name),
                None => Self::missing(),
            }
        };

        let (class_info, term_info) = match student.school_class_id {
            None => (Self::unassigned(), Self::unassigned()),
            Some(cid) => match SchoolClassRepository::find_by_id(pool, cid).await? {
                None => (Self::missing(), Self::missing()),
                Some(sc) => {
                    let class_prof = Self::available(&sc.name);
                    let term_prof = match sc.term_id {
                        None => Self::unassigned(),
                        Some(tid) => match TermRepository::find_by_id(pool, tid).await? {
                            Some(t) => Self::available(&t.name),
                            None => Self::missing(),
                        },
                    };
                    (class_prof, term_prof)
                }
            },
        };

        let group_info = Self::current_group(pool, &student).await?;

        Ok(StudentProfileDTO {
            full_name: student.full_name,
            roll_number: student.roll_number,
            email: user.email,
            activated: user.activated,
            major: major_info,
            school_class: class_info,
            term: term_info,
            group: group_info,
            school_class_id: student.school_class_id,
            self_description: student.self_description,
        })
    }

    pub async fn update_bio(
        pool: &MySqlPool,
        user_id: i64,
        user_email: &str,
        bio: Option<String>,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<Option<String>, AppError> {
        let student = StudentRepository::find_by_id(pool, user_id)
            .await?
            .ok_or_else(Self::not_found)?;

        let trimmed = bio.as_deref().map(str::trim).filter(|s| !s.is_empty());
        if let Some(t) = trimmed {
            if t.chars().count() > 500 {
                return Err(AppError::bad_request(
                    "Bio must not exceed 500 characters",
                    "studentProfile",
                    "bioTooLong",
                ));
            }
        }

        StudentRepository::update_bio(pool, user_id, trimmed).await?;

        Self::broadcast_bio_updated(
            pool,
            student.user_id,
            student.school_class_id,
            user_email,
            trimmed,
            event_sender,
        )
        .await?;

        Ok(trimmed.map(String::from))
    }

    pub async fn delete_bio(
        pool: &MySqlPool,
        user_id: i64,
        user_email: &str,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<(), AppError> {
        let student = StudentRepository::find_by_id(pool, user_id)
            .await?
            .ok_or_else(Self::not_found)?;

        StudentRepository::update_bio(pool, user_id, None).await?;

        Self::broadcast_bio_updated(
            pool,
            student.user_id,
            student.school_class_id,
            user_email,
            None,
            event_sender,
        )
        .await?;

        Ok(())
    }

    async fn broadcast_bio_updated(
        pool: &MySqlPool,
        student_id: i64,
        school_class_id: Option<i32>,
        actor_email: &str,
        bio: Option<&str>,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<(), AppError> {
        let cid = match school_class_id {
            Some(id) => id,
            None => return Ok(()),
        };

        let payload = serde_json::json!({
            "studentId": student_id,
            "selfDescription": bio.unwrap_or("")
        });

        let class_deadlines = DeadlineRepository::find_all_by_school_class_id(pool, cid).await?;

        if class_deadlines.is_empty() {
            let _ = event_sender.send(GroupRealtimeEvent {
                event_id: Uuid::new_v4().to_string(),
                event_type: "STUDENT_BIO_UPDATED".into(),
                group_id: None,
                deadline_id: None,
                school_class_id: Some(cid),
                actor: Some(actor_email.to_string()),
                timestamp: Utc::now(),
                payload,
            });
        } else {
            for d in class_deadlines {
                let _ = event_sender.send(GroupRealtimeEvent {
                    event_id: Uuid::new_v4().to_string(),
                    event_type: "STUDENT_BIO_UPDATED".into(),
                    group_id: None,
                    deadline_id: Some(d.id),
                    school_class_id: Some(cid),
                    actor: Some(actor_email.to_string()),
                    timestamp: Utc::now(),
                    payload: payload.clone(),
                });
            }
        }

        Ok(())
    }

    async fn current_group(
        pool: &MySqlPool,
        student: &crate::domain::Student,
    ) -> Result<ProfileInfo, AppError> {
        let memberships = GroupMemberRepository::find_by_student_id(pool, student.user_id).await?;
        if memberships.is_empty() {
            return Ok(Self::unassigned());
        }

        let cid = match student.school_class_id {
            Some(id) => id,
            None => return Ok(Self::missing()),
        };

        if memberships.len() != 1 {
            return Ok(Self::missing());
        }

        let membership = &memberships[0];
        if membership.school_class_id != cid {
            return Ok(Self::missing());
        }

        let group = GroupRepository::find_by_id(pool, membership.group_id).await?;
        if let Some(group) = group {
            let deadline_count =
                DeadlineRepository::count_by_deadline_id_and_class_id(pool, group.deadline_id, cid)
                    .await?;

            if group.status != "DISBANDED"
                && group.school_class_id == cid
                && group.deadline_id == membership.deadline_id
                && deadline_count == 1
            {
                Ok(Self::available(&group.name))
            } else {
                Ok(Self::missing())
            }
        } else {
            Ok(Self::missing())
        }
    }

    fn available(name: &str) -> ProfileInfo {
        if name.trim().is_empty() {
            Self::missing()
        } else {
            ProfileInfo {
                name: Some(name.to_string()),
                state: "AVAILABLE".to_string(),
            }
        }
    }

    fn unassigned() -> ProfileInfo {
        ProfileInfo {
            name: None,
            state: "UNASSIGNED".to_string(),
        }
    }

    fn missing() -> ProfileInfo {
        ProfileInfo {
            name: None,
            state: "MISSING".to_string(),
        }
    }

    fn not_found() -> AppError {
        AppError::bad_request(
            "Student profile not found",
            "studentProfile",
            "profileNotFound",
        )
    }
}
