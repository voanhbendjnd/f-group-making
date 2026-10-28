use chrono::{DateTime, Utc};
use sqlx::MySqlPool;
use std::collections::HashSet;
use uuid::Uuid;

use crate::domain::{
    AuthoritiesConstants, Deadline, DeadlineClassWindow, DeadlineStatus, SchoolClass,
};
use crate::dto::deadline::{
    CloseDeadlineDTO, CreateDeadlineDTO, DeadlineClassDTO, DeadlineDTO, DeadlineValidateDTO,
    StudentDeadlineActivityDTO, UpdateDeadlineDTO,
};
use crate::dto::realtime::GroupRealtimeEvent;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::GroupRepository;
use crate::repository::rule_repository::RuleRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::security::AuthUser;
use crate::service::school_class_service::SchoolClassService;
use crate::service::term_service::TermService;

pub struct DeadlineService;

impl DeadlineService {
    pub async fn ensure_grouping_session(
        pool: &MySqlPool,
        auth: &AuthUser,
        class_id: i32,
        term_id: Option<i32>,
    ) -> Result<DeadlineDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id_for_update(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        SchoolClassService::require_write_access(auth, &school_class)?;
        TermService::validate_term(pool, term_id).await?;

        if let Some(tid) = term_id {
            if school_class.term_id != Some(tid) {
                return Err(AppError::bad_request(
                    "Class does not belong to selected term",
                    "schoolClass",
                    "classNotInTerm",
                ));
            }
        }

        let sessions = DeadlineRepository::find_all_by_school_class_id(pool, class_id).await?;
        if sessions.len() > 1 {
            return Err(AppError::conflict(
                "Select a specific grouping session",
                "group",
                "allocationMultipleSessions",
            ));
        }

        if let Some(session) = sessions.first() {
            return Self::to_dto(pool, auth, session).await;
        }

        let session = DeadlineRepository::create_deadline(
            pool,
            &school_class.name,
            None,
            None,
            None,
            "UNSCHEDULED",
            &[class_id],
            Some(&auth.email),
        )
        .await?;

        Self::to_dto(pool, auth, &session).await
    }

    pub async fn create_deadline(
        pool: &MySqlPool,
        auth: &AuthUser,
        dto: CreateDeadlineDTO,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<DeadlineDTO, AppError> {
        let now = Utc::now();

        if dto.start_time >= dto.end_time {
            return Err(AppError::bad_request(
                "End time must be after start time",
                "deadline",
                "endTimeBeforeStartTime",
            ));
        }

        if dto.end_time <= now {
            return Err(AppError::bad_request(
                "End time must be in the future",
                "deadline",
                "endTimeInPast",
            ));
        }

        let mut class_ids = dto.school_class_ids;
        class_ids.sort();
        class_ids.dedup();

        if class_ids.is_empty() {
            return Err(AppError::bad_request(
                "One or more school classes not found",
                "deadline",
                "classNotFound",
            ));
        }

        let mut classes = Vec::new();
        for &id in &class_ids {
            let sc = SchoolClassRepository::find_by_id_for_update(pool, id)
                .await?
                .ok_or_else(|| {
                    AppError::bad_request("Class not found", "deadline", "classNotFound")
                })?;
            classes.push(sc);
        }

        for &cid in &class_ids {
            let sessions = DeadlineRepository::find_all_by_school_class_id(pool, cid).await?;
            if class_ids.len() == 1 && sessions.len() == 1 {
                let first_session = &sessions[0];
                if Self::resolve_status(
                    &first_session.status,
                    first_session.start_time,
                    first_session.end_time,
                    now,
                ) == DeadlineStatus::UNSCHEDULED
                {
                    SchoolClassService::require_write_access(auth, &classes[0])?;
                    return Self::schedule_existing(
                        pool,
                        auth,
                        first_session.id,
                        &dto.name,
                        dto.description.as_deref(),
                        dto.start_time,
                        dto.end_time,
                        event_sender,
                    )
                    .await;
                }
            }

            if !sessions.is_empty() {
                return Err(AppError::bad_request(
                    "This class already has a group formation session. Extend or reopen that session.",
                    "deadline",
                    "sessionAlreadyExists",
                ));
            }
        }

        if !auth.has_role(AuthoritiesConstants::ADMIN) {
            let has_unauthorized = classes.iter().any(|sc| sc.lecturer_id != Some(auth.id));
            if has_unauthorized {
                return Err(AppError::forbidden(
                    "You can only create deadlines for classes that you manage.",
                    "deadline",
                    "accessDenied",
                ));
            }
        }

        let deadline = DeadlineRepository::create_deadline(
            pool,
            dto.name.trim(),
            dto.description.as_deref(),
            Some(dto.start_time),
            Some(dto.end_time),
            "ACTIVE",
            &class_ids,
            Some(&auth.email),
        )
        .await?;

        Self::broadcast_deadline_event(
            event_sender,
            "DEADLINE_CREATED",
            &deadline,
            &class_ids,
            &auth.email,
        );

        Self::to_dto(pool, auth, &deadline).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_deadline(
        pool: &MySqlPool,
        auth: &AuthUser,
        id: i32,
        dto: UpdateDeadlineDTO,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<DeadlineDTO, AppError> {
        let existing = DeadlineRepository::find_for_update(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Deadline not found", "deadline", "notFound"))?;

        if let Some(expected) = dto.expected_version {
            if expected != existing.version {
                return Err(AppError::conflict(
                    "Deadline changed; refresh and try again",
                    "deadline",
                    "deadlineVersionConflict",
                ));
            }
        }

        let now = Utc::now();
        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, id).await?;
        let all_ids: HashSet<i32> = classes.iter().map(|c| c.id).collect();

        if let Some(ref sc_ids) = dto.school_class_ids {
            let req_ids: HashSet<i32> = sc_ids.iter().copied().collect();
            if req_ids != all_ids {
                return Err(AppError::bad_request(
                    "Session classes cannot be changed",
                    "deadline",
                    "immutableClasses",
                ));
            }
        }

        let targets: HashSet<i32> = match dto.scope.as_deref() {
            Some("SELECTED") => dto
                .target_class_ids
                .clone()
                .unwrap_or_default()
                .into_iter()
                .collect(),
            _ => all_ids.clone(),
        };

        if targets.is_empty() || !all_ids.is_superset(&targets) {
            return Err(AppError::bad_request(
                "Select valid classes in this deadline",
                "deadline",
                "invalidTargetClasses",
            ));
        }

        for sc in classes.iter().filter(|c| targets.contains(&c.id)) {
            SchoolClassService::require_write_access(auth, sc)?;
        }

        if targets.len() > 1 {
            let confirmed: HashSet<i32> = dto
                .confirmed_class_ids
                .clone()
                .unwrap_or_default()
                .into_iter()
                .collect();
            if confirmed != targets {
                return Err(AppError::bad_request(
                    "Confirm every affected class",
                    "deadline",
                    "confirmClassesRequired",
                ));
            }
        }

        let windows = DeadlineRepository::find_class_windows_by_deadline_id(pool, id).await?;

        if Self::resolve_status(
            &existing.status,
            existing.start_time,
            existing.end_time,
            now,
        ) == DeadlineStatus::UNSCHEDULED
        {
            if targets != all_ids || !Self::can_manage_all(auth, &classes) {
                return Err(AppError::forbidden(
                    "Schedule all classes in this session",
                    "deadline",
                    "accessDenied",
                ));
            }

            return Self::schedule_existing(
                pool,
                auth,
                existing.id,
                &dto.name,
                dto.description.as_deref(),
                dto.start_time.unwrap_or(now),
                dto.end_time,
                event_sender,
            )
            .await;
        }

        let changes_metadata = existing.name != dto.name.trim()
            || existing.description != dto.description.as_deref().map(str::trim).map(String::from);

        if changes_metadata && !Self::can_manage_all(auth, &classes) {
            return Err(AppError::forbidden(
                "Only the manager of every class may edit shared metadata",
                "deadline",
                "accessDenied",
            ));
        }

        let upcoming = !existing.status.eq_ignore_ascii_case("CANCELLED")
            && existing.start_time.map(|st| st > now).unwrap_or(false);

        let mut start = existing.start_time;
        if let Some(new_start) = dto.start_time {
            if Some(new_start) != start {
                if !upcoming
                    || targets != all_ids
                    || !Self::can_manage_all(auth, &classes)
                    || new_start < now
                {
                    return Err(AppError::bad_request(
                        "Start time is fixed except for all upcoming classes",
                        "deadline",
                        "startTimeInPast",
                    ));
                }
                start = Some(new_start);
            }
        }

        if dto.end_time <= now || (start.is_some() && dto.end_time <= start.unwrap()) {
            return Err(AppError::bad_request(
                "Deadline must end in the future and after its start",
                "deadline",
                "invalidEndTime",
            ));
        }

        let mut reopening = false;
        for c in classes.iter().filter(|c| targets.contains(&c.id)) {
            let state = Self::resolve_class_status(
                &existing.status,
                existing.start_time,
                existing.end_time,
                &windows,
                c.id,
                now,
            );
            if state == DeadlineStatus::ACTIVE {
                let current_end = Self::end_time_for(existing.end_time, &windows, c.id);
                if let Some(ce) = current_end {
                    if dto.end_time <= ce {
                        return Err(AppError::bad_request(
                            "Active class deadline can only be extended",
                            "deadline",
                            "invalidEndTime",
                        ));
                    }
                }
            }
            if state == DeadlineStatus::EXPIRED {
                reopening = true;
            }
        }

        let status = "ACTIVE";
        let mut final_start = start;
        let mut final_end = existing.end_time;
        let mut window_overrides = Vec::new();

        if existing.status.eq_ignore_ascii_case("CANCELLED") {
            let mut closed = existing.cancelled_at.unwrap_or(now);
            if closed > now {
                closed = now;
            }
            final_end = Some(closed);
            if let Some(st) = final_start {
                if st > closed {
                    final_start = Some(closed);
                }
            }
        }

        if targets == all_ids {
            final_end = Some(dto.end_time);
            for c in &classes {
                window_overrides.push((c.id, None));
            }
        } else {
            for &cid in &targets {
                window_overrides.push((cid, Some(dto.end_time)));
            }
        }

        let updated = DeadlineRepository::update_deadline_record(
            pool,
            existing.id,
            dto.name.trim(),
            dto.description.as_deref(),
            final_start,
            final_end,
            status,
            &window_overrides,
            Some(&auth.email),
        )
        .await?;

        let event_type = if reopening {
            "DEADLINE_REOPENED"
        } else if upcoming {
            "DEADLINE_UPDATED"
        } else {
            "DEADLINE_EXTENDED"
        };

        let target_vec: Vec<i32> = targets.into_iter().collect();
        Self::broadcast_deadline_event(
            event_sender,
            event_type,
            &updated,
            &target_vec,
            &auth.email,
        );

        Self::to_dto(pool, auth, &updated).await
    }

    #[allow(clippy::too_many_arguments)]
    async fn schedule_existing(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        name: &str,
        description: Option<&str>,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<DeadlineDTO, AppError> {
        if end <= start || end <= Utc::now() {
            return Err(AppError::bad_request(
                "Deadline must end in the future and after its start",
                "deadline",
                "invalidEndTime",
            ));
        }

        let updated = DeadlineRepository::update_deadline_record(
            pool,
            deadline_id,
            name.trim(),
            description,
            Some(start),
            Some(end),
            "ACTIVE",
            &[],
            Some(&auth.email),
        )
        .await?;

        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, deadline_id).await?;
        let class_ids: Vec<i32> = classes.into_iter().map(|c| c.id).collect();

        Self::broadcast_deadline_event(
            event_sender,
            "DEADLINE_CREATED",
            &updated,
            &class_ids,
            &auth.email,
        );

        Self::to_dto(pool, auth, &updated).await
    }

    pub async fn get_deadlines(
        pool: &MySqlPool,
        auth: &AuthUser,
        page: i64,
        size: i64,
        term_id: Option<i32>,
    ) -> Result<ResultPaginationDTO<DeadlineDTO>, AppError> {
        TermService::validate_term(pool, term_id).await?;

        let (deadlines, total) = if auth.has_role(AuthoritiesConstants::ADMIN) {
            DeadlineRepository::search_deadlines_admin(pool, term_id, page, size).await?
        } else if auth.has_role(AuthoritiesConstants::LECTURE)
            || auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
        {
            DeadlineRepository::search_deadlines_lecturer(pool, auth.id, term_id, page, size)
                .await?
        } else if auth.has_role(AuthoritiesConstants::STUDENT) {
            let student = StudentRepository::find_by_id(pool, auth.id)
                .await?
                .ok_or_else(|| {
                    AppError::not_found("Student profile not found", "student", "notFound")
                })?;

            if let Some(cid) = student.school_class_id {
                DeadlineRepository::search_deadlines_student(pool, cid, term_id, page, size).await?
            } else {
                return Ok(ResultPaginationDTO::new(Vec::new(), 0, page, size));
            }
        } else {
            return Err(AppError::forbidden(
                "Access denied",
                "deadline",
                "accessDenied",
            ));
        };

        let mut dtos = Vec::new();
        for d in &deadlines {
            dtos.push(Self::to_dto(pool, auth, d).await?);
        }

        Ok(ResultPaginationDTO::new(dtos, total, page, size))
    }

    pub async fn get_deadline_by_id(
        pool: &MySqlPool,
        auth: &AuthUser,
        id: i32,
    ) -> Result<DeadlineDTO, AppError> {
        let deadline = DeadlineRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Deadline not found", "deadline", "notFound"))?;

        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, id).await?;

        if !auth.has_role(AuthoritiesConstants::ADMIN) {
            if auth.has_role(AuthoritiesConstants::LECTURE)
                || auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
            {
                let is_associated = classes.iter().any(|sc| sc.lecturer_id == Some(auth.id));
                if !is_associated {
                    return Err(AppError::forbidden(
                        "You cannot view this deadline",
                        "deadline",
                        "accessDenied",
                    ));
                }
            } else if auth.has_role(AuthoritiesConstants::STUDENT) {
                let student = StudentRepository::find_by_id(pool, auth.id)
                    .await?
                    .ok_or_else(|| {
                        AppError::not_found("Student not found", "student", "notFound")
                    })?;
                let in_class = classes
                    .iter()
                    .any(|sc| Some(sc.id) == student.school_class_id);
                if !in_class {
                    return Err(AppError::forbidden(
                        "You cannot view this deadline",
                        "deadline",
                        "accessDenied",
                    ));
                }
            }
        }

        Self::to_dto(pool, auth, &deadline).await
    }

    pub async fn validate_deadline_for_student(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<DeadlineValidateDTO, AppError> {
        let student = StudentRepository::find_by_id(pool, auth.id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Student profile not found", "student", "notFound")
            })?;

        if student.school_class_id != Some(class_id) {
            return Err(AppError::forbidden(
                "You do not belong to the requested class",
                "deadline",
                "classMismatch",
            ));
        }

        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| AppError::not_found("Deadline not found", "deadline", "notFound"))?;

        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, deadline_id).await?;
        let target_class = classes
            .into_iter()
            .find(|sc| sc.id == class_id)
            .ok_or_else(|| {
                AppError::bad_request(
                    "This class is not included in the specified deadline",
                    "deadline",
                    "classNotInDeadline",
                )
            })?;

        let windows =
            DeadlineRepository::find_class_windows_by_deadline_id(pool, deadline_id).await?;

        let now = Utc::now();
        let status = Self::resolve_class_status(
            &deadline.status,
            deadline.start_time,
            deadline.end_time,
            &windows,
            class_id,
            now,
        );
        let is_valid = status == DeadlineStatus::ACTIVE;

        let message = if deadline.status.eq_ignore_ascii_case("CANCELLED") {
            "Deadline đã kết thúc; có thể được mở lại bởi giáo viên."
        } else {
            match status {
                DeadlineStatus::UNSCHEDULED => "Lớp chưa mở thời gian chọn nhóm.",
                DeadlineStatus::UPCOMING => "Thời gian chọn nhóm chưa bắt đầu.",
                DeadlineStatus::EXPIRED => "Deadline chọn nhóm đã kết thúc.",
                DeadlineStatus::ACTIVE => "Deadline chọn nhóm đang mở.",
                DeadlineStatus::CANCELLED => "Deadline đã kết thúc.",
            }
        };

        Ok(DeadlineValidateDTO {
            valid: is_valid,
            status: Some(status),
            deadline_id: deadline.id,
            name: deadline.name,
            description: deadline.description,
            start_time: deadline.start_time,
            end_time: Self::end_time_for(deadline.end_time, &windows, class_id),
            class_id,
            class_name: target_class.name,
            message: message.to_string(),
        })
    }

    pub async fn close_deadline(
        pool: &MySqlPool,
        auth: &AuthUser,
        id: i32,
        request: CloseDeadlineDTO,
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
    ) -> Result<DeadlineDTO, AppError> {
        let deadline = DeadlineRepository::find_for_update(pool, id)
            .await?
            .ok_or_else(|| AppError::not_found("Deadline not found", "deadline", "notFound"))?;

        if let Some(expected) = request.expected_version {
            if expected != deadline.version {
                return Err(AppError::conflict(
                    "Deadline changed; refresh and try again",
                    "deadline",
                    "deadlineVersionConflict",
                ));
            }
        }

        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, id).await?;
        for sc in &classes {
            SchoolClassService::require_write_access(auth, sc)?;
        }

        let all_ids: HashSet<i32> = classes.iter().map(|c| c.id).collect();
        if all_ids.len() > 1 {
            let confirmed: HashSet<i32> = request
                .confirmed_class_ids
                .clone()
                .unwrap_or_default()
                .into_iter()
                .collect();
            if confirmed != all_ids {
                return Err(AppError::bad_request(
                    "Confirm every affected class",
                    "deadline",
                    "confirmClassesRequired",
                ));
            }
        }

        let now = Utc::now();
        let windows = DeadlineRepository::find_class_windows_by_deadline_id(pool, id).await?;

        let is_any_active = classes.iter().any(|sc| {
            Self::resolve_class_status(
                &deadline.status,
                deadline.start_time,
                deadline.end_time,
                &windows,
                sc.id,
                now,
            ) == DeadlineStatus::ACTIVE
        });

        if !is_any_active {
            let is_any_upcoming = classes.iter().any(|sc| {
                Self::resolve_class_status(
                    &deadline.status,
                    deadline.start_time,
                    deadline.end_time,
                    &windows,
                    sc.id,
                    now,
                ) == DeadlineStatus::UPCOMING
            });
            if is_any_upcoming {
                return Err(AppError::bad_request(
                    "An upcoming deadline cannot be closed",
                    "deadline",
                    "deadlineNotActive",
                ));
            }
            return Self::to_dto(pool, auth, &deadline).await;
        }

        let closed =
            DeadlineRepository::close_deadline_record(pool, id, now, Some(&auth.email)).await?;

        let class_ids: Vec<i32> = classes.into_iter().map(|c| c.id).collect();
        Self::broadcast_deadline_event(
            event_sender,
            "DEADLINE_CLOSED",
            &closed,
            &class_ids,
            &auth.email,
        );

        Self::to_dto(pool, auth, &closed).await
    }

    pub async fn get_my_activities(
        pool: &MySqlPool,
        auth: &AuthUser,
    ) -> Result<Vec<StudentDeadlineActivityDTO>, AppError> {
        let student = StudentRepository::find_by_id(pool, auth.id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Student profile not found", "student", "notFound")
            })?;

        let class_id = match student.school_class_id {
            Some(id) => id,
            None => return Ok(Vec::new()),
        };

        let school_class = SchoolClassRepository::find_by_id(pool, class_id).await?;
        let class_name = school_class
            .map(|sc| sc.name)
            .unwrap_or_else(|| "Lớp học".to_string());

        let deadlines = DeadlineRepository::find_all_by_school_class_id(pool, class_id).await?;
        let now = Utc::now();

        let mut activities = Vec::new();
        for d in deadlines {
            let windows = DeadlineRepository::find_class_windows_by_deadline_id(pool, d.id).await?;
            let status = Self::resolve_class_status(
                &d.status,
                d.start_time,
                d.end_time,
                &windows,
                class_id,
                now,
            );
            let effective_end = Self::end_time_for(d.end_time, &windows, class_id);

            let mut act = StudentDeadlineActivityDTO {
                deadline_id: d.id,
                deadline_name: d.name,
                deadline_description: d.description,
                start_time: d.start_time,
                end_time: effective_end,
                status: Some(status),
                school_class_id: class_id,
                school_class_name: class_name.clone(),
                has_group: false,
                group_id: None,
                group_name: None,
                group_status: None,
                member_count: None,
                max_members: None,
                is_leader: false,
            };

            let membership =
                GroupMemberRepository::find_by_student_id_and_deadline_id(pool, auth.id, d.id)
                    .await?;
            if let Some(mem) = membership {
                let group = GroupRepository::find_by_id(pool, mem.group_id).await?;
                if let Some(g) = group {
                    if g.status != "DISBANDED"
                        && mem.school_class_id == class_id
                        && g.school_class_id == class_id
                        && g.deadline_id == d.id
                    {
                        let count = GroupMemberRepository::count_by_group_id(pool, g.id).await?;
                        let max_m =
                            RuleRepository::get_rule_value(pool, class_id, "MAX_MEMBERS_PER_GROUP")
                                .await?
                                .unwrap_or(6);

                        act.has_group = true;
                        act.group_id = Some(g.id);
                        act.group_name = Some(g.name);
                        act.group_status = Some(g.status);
                        act.member_count = Some(count as i32);
                        act.max_members = Some(max_m);
                        act.is_leader = mem.role == "LEADER";
                    }
                }
            }

            activities.push(act);
        }

        activities.sort_by(|a, b| {
            let order_a = match a.status {
                Some(DeadlineStatus::ACTIVE) => 0,
                Some(DeadlineStatus::UPCOMING) => 1,
                _ => 2,
            };
            let order_b = match b.status {
                Some(DeadlineStatus::ACTIVE) => 0,
                Some(DeadlineStatus::UPCOMING) => 1,
                _ => 2,
            };

            order_a
                .cmp(&order_b)
                .then_with(|| b.end_time.cmp(&a.end_time))
        });

        Ok(activities)
    }

    async fn to_dto(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline: &Deadline,
    ) -> Result<DeadlineDTO, AppError> {
        let classes = DeadlineRepository::find_classes_by_deadline_id(pool, deadline.id).await?;
        let windows =
            DeadlineRepository::find_class_windows_by_deadline_id(pool, deadline.id).await?;

        let now = Utc::now();
        let overall_status = Self::resolve_status(
            &deadline.status,
            deadline.start_time,
            deadline.end_time,
            now,
        );

        let mut class_windows = Vec::new();
        for sc in &classes {
            let st = Self::resolve_class_status(
                &deadline.status,
                deadline.start_time,
                deadline.end_time,
                &windows,
                sc.id,
                now,
            );
            let can_edit = Self::can_manage_class(auth, sc);
            class_windows.push(DeadlineClassDTO {
                school_class_id: sc.id,
                school_class_name: sc.name.clone(),
                start_time: deadline.start_time,
                end_time: Self::end_time_for(deadline.end_time, &windows, sc.id),
                status: st,
                can_edit,
            });
        }

        let mixed_class_windows = class_windows
            .iter()
            .map(|w| w.end_time)
            .collect::<HashSet<_>>()
            .len()
            > 1
            || class_windows
                .iter()
                .map(|w| w.status.clone())
                .collect::<HashSet<_>>()
                .len()
                > 1;

        let manages = Self::can_manage_all(auth, &classes);
        let can_close = manages
            && class_windows
                .iter()
                .any(|w| w.status == DeadlineStatus::ACTIVE);
        let can_edit = class_windows.iter().any(|w| w.can_edit);

        let class_ids: Vec<i32> = classes.iter().map(|c| c.id).collect();
        let class_names: Vec<String> = classes.iter().map(|c| c.name.clone()).collect();

        let mut dto = DeadlineDTO {
            id: deadline.id,
            name: deadline.name.clone(),
            description: deadline.description.clone(),
            start_time: deadline.start_time,
            end_time: deadline.end_time,
            status: Some(overall_status),
            version: deadline.version,
            cancelled_at: deadline.cancelled_at,
            cancelled_by: deadline.cancelled_by.clone(),
            can_edit,
            can_cancel: can_close,
            can_close,
            mixed_class_windows,
            class_windows,
            school_class_ids: class_ids,
            school_class_names: class_names,
            created_date: deadline.created_date,
            created_by: deadline.created_by.clone(),
            last_modified_date: deadline.last_modified_date,
            last_modified_by: deadline.last_modified_by.clone(),
        };

        if auth.has_role(AuthoritiesConstants::STUDENT)
            && !auth.has_role(AuthoritiesConstants::ADMIN)
            && !auth.has_role(AuthoritiesConstants::LECTURE)
            && !auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
        {
            if let Some(student) = StudentRepository::find_by_id(pool, auth.id).await? {
                if let Some(cid) = student.school_class_id {
                    dto.end_time = Self::end_time_for(deadline.end_time, &windows, cid);
                    dto.status = Some(Self::resolve_class_status(
                        &deadline.status,
                        deadline.start_time,
                        deadline.end_time,
                        &windows,
                        cid,
                        now,
                    ));
                    dto.class_windows.retain(|w| w.school_class_id == cid);
                    dto.mixed_class_windows = false;
                }
            }
        }

        Ok(dto)
    }

    fn broadcast_deadline_event(
        event_sender: &tokio::sync::broadcast::Sender<GroupRealtimeEvent>,
        event_type: &str,
        deadline: &Deadline,
        class_ids: &[i32],
        actor_email: &str,
    ) {
        let payload = serde_json::json!({
            "deadlineId": deadline.id,
            "deadlineName": deadline.name,
            "status": deadline.status,
        });

        for &cid in class_ids {
            let _ = event_sender.send(GroupRealtimeEvent {
                event_id: Uuid::new_v4().to_string(),
                event_type: event_type.to_string(),
                group_id: None,
                deadline_id: Some(deadline.id),
                school_class_id: Some(cid),
                actor: Some(actor_email.to_string()),
                timestamp: Utc::now(),
                payload: payload.clone(),
            });
        }
    }

    fn can_manage_class(auth: &AuthUser, sc: &SchoolClass) -> bool {
        if auth.has_role(AuthoritiesConstants::ADMIN) {
            return true;
        }
        if !auth.has_role(AuthoritiesConstants::LECTURE)
            && !auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
        {
            return false;
        }
        sc.lecturer_id == Some(auth.id)
    }

    fn can_manage_all(auth: &AuthUser, classes: &[SchoolClass]) -> bool {
        if auth.has_role(AuthoritiesConstants::ADMIN) {
            return true;
        }
        if !auth.has_role(AuthoritiesConstants::LECTURE)
            && !auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
        {
            return false;
        }
        !classes.is_empty() && classes.iter().all(|c| c.lecturer_id == Some(auth.id))
    }

    fn end_time_for(
        deadline_end: Option<DateTime<Utc>>,
        windows: &[DeadlineClassWindow],
        class_id: i32,
    ) -> Option<DateTime<Utc>> {
        windows
            .iter()
            .find(|w| w.school_class_id == class_id)
            .and_then(|w| w.end_time_override)
            .or(deadline_end)
    }

    fn resolve_status(
        status_str: &str,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        now: DateTime<Utc>,
    ) -> DeadlineStatus {
        if status_str.eq_ignore_ascii_case("CANCELLED") {
            return DeadlineStatus::EXPIRED;
        }
        match (start_time, end_time) {
            (Some(s), Some(e)) => {
                if now < s {
                    DeadlineStatus::UPCOMING
                } else if now >= e {
                    DeadlineStatus::EXPIRED
                } else {
                    DeadlineStatus::ACTIVE
                }
            }
            _ => DeadlineStatus::UNSCHEDULED,
        }
    }

    pub fn resolve_class_status(
        status_str: &str,
        start_time: Option<DateTime<Utc>>,
        deadline_end: Option<DateTime<Utc>>,
        windows: &[DeadlineClassWindow],
        class_id: i32,
        now: DateTime<Utc>,
    ) -> DeadlineStatus {
        let eff_end = Self::end_time_for(deadline_end, windows, class_id);
        Self::resolve_status(status_str, start_time, eff_end, now)
    }

    pub async fn resolve_class_window(
        deadline: &Deadline,
        class_id: i32,
        pool: &MySqlPool,
    ) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
        let windows = DeadlineRepository::find_class_windows_by_deadline_id(pool, deadline.id)
            .await
            .unwrap_or_default();
        let eff_end = Self::end_time_for(deadline.end_time, &windows, class_id);
        (deadline.start_time, eff_end)
    }

    pub async fn resolve_deadline_status_for_class(
        pool: &MySqlPool,
        deadline: &Deadline,
        class_id: i32,
        now: DateTime<Utc>,
    ) -> DeadlineStatus {
        let windows = DeadlineRepository::find_class_windows_by_deadline_id(pool, deadline.id)
            .await
            .unwrap_or_default();
        Self::resolve_class_status(
            &deadline.status,
            deadline.start_time,
            deadline.end_time,
            &windows,
            class_id,
            now,
        )
    }
}
