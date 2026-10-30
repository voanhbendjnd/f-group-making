use chrono::Utc;
use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};
use tokio::sync::broadcast::Sender;

use crate::domain::{
    AuthoritiesConstants, DeadlineStatus, Group, GroupMemberRole, GroupStatus, GroupingRuleCode,
};
use crate::dto::group::{
    CreateGroupRequest, GroupDTO, GroupMemberDTO, GroupReviewDTO, GroupRuleEvaluationDTO,
    LecturerCreateGroupRequest, RejectGroupRequest, TransferLeaderRequest, WorkspaceDTO,
};
use crate::dto::rule::GroupingRuleDTO;
use crate::dto::realtime::GroupRealtimeEvent;
use crate::dto::ResultPaginationDTO;
use crate::error::AppError;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::{
    GroupHistoryRepository, GroupInvitationRepository, GroupRepository,
};
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::repository::user_repository::UserRepository;
use crate::security::AuthUser;
use crate::service::deadline_service::DeadlineService;
use crate::service::group_rule_validation_service::GroupRuleValidationService;
use crate::service::school_class_service::SchoolClassService;

pub struct GroupService;

impl GroupService {
    pub async fn get_workspace(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<WorkspaceDTO, AppError> {
        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    "Không tìm thấy đợt hạn này",
                    "deadline",
                    "ERR_DEADLINE_NOT_FOUND",
                )
            })?;

        let belongs =
            DeadlineRepository::count_by_deadline_id_and_class_id(pool, deadline_id, class_id)
                .await?;
        if belongs == 0 {
            return Err(AppError::forbidden(
                "Đợt hạn không áp dụng cho lớp học này",
                "deadline",
                "ERR_DEADLINE_NOT_IN_CLASS",
            ));
        }

        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Không tìm thấy lớp học", "schoolClass", "classNotFound")
            })?;

        let is_lecturer_or_admin = auth.is_admin()
            || auth.has_role(AuthoritiesConstants::LECTURE_MASTER)
            || auth.has_role(AuthoritiesConstants::LECTURE);

        if !is_lecturer_or_admin {
            let student = StudentRepository::find_student_profile(pool, auth.id).await?;
            if student.school_class_id != Some(class_id) {
                return Err(AppError::forbidden(
                    "Sinh viên không thuộc lớp học này",
                    "group",
                    "ERR_FORBIDDEN_NOT_IN_CLASS",
                ));
            }
        }

        let now = Utc::now();
        let deadline_status =
            DeadlineService::resolve_deadline_status_for_class(pool, &deadline, class_id, now)
                .await;
        let deadline_expired = deadline_status == DeadlineStatus::EXPIRED
            || deadline_status == DeadlineStatus::CANCELLED;

        let read_only_reason = match deadline_status {
            DeadlineStatus::UNSCHEDULED => Some("Đợt chọn nhóm chưa được lên lịch".to_string()),
            DeadlineStatus::UPCOMING => Some("Đợt chọn nhóm chưa bắt đầu".to_string()),
            DeadlineStatus::EXPIRED => Some("Đợt chọn nhóm đã kết thúc".to_string()),
            DeadlineStatus::CANCELLED => Some("Đợt chọn nhóm đã bị hủy".to_string()),
            DeadlineStatus::ACTIVE => None,
        };

        let can_manage_groups = (deadline_status == DeadlineStatus::ACTIVE && !deadline_expired)
            || is_lecturer_or_admin;

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);

        let groups =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?;
        let active_group_count = groups
            .iter()
            .filter(|g| g.status != GroupStatus::DISBANDED.as_str())
            .count() as i64;

        let mut group_dtos = Vec::new();
        for g in groups {
            if g.status == GroupStatus::DISBANDED.as_str() {
                continue;
            }
            let dto = Self::build_group_dto(pool, &g, &class_rules, max_members, Some(active_group_count)).await?;
            group_dtos.push(dto);
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let assigned_ids =
            GroupMemberRepository::find_assigned_student_ids(pool, class_id, deadline_id).await?;
        let assigned_set: HashSet<i64> = assigned_ids.into_iter().collect();

        let unassigned_students: Vec<GroupMemberDTO> = class_students
            .into_iter()
            .filter(|s| !assigned_set.contains(&s.user_id))
            .map(|s| GroupMemberDTO {
                id: 0,
                group_id: 0,
                student_id: s.user_id,
                roll_number: Some(s.roll_number),
                full_name: Some(s.full_name),
                email: Some(s.email),
                member_code: s.member_code,
                cohort: s.cohort,
                slot_type: s.slot_type,
                major_id: s.major_id,
                major_code: s.major_code,
                major_name: s.major_name,
                role: GroupMemberRole::MEMBER,
                joined_at: None,
                self_description: s.self_description,
                match_score: None,
                match_reasons: Vec::new(),
            })
            .collect();

        let my_membership = if !is_lecturer_or_admin {
            GroupMemberRepository::find_by_student_id_and_deadline_id(pool, auth.id, deadline_id)
                .await?
        } else {
            None
        };

        let my_group = if let Some(ref m) = my_membership {
            group_dtos.iter().find(|g| g.id == m.group_id).cloned()
        } else {
            None
        };

        let is_leader = my_group
            .as_ref()
            .map(|g| g.leader_id == auth.id)
            .unwrap_or(false);

        let can_create_group =
            can_manage_groups && my_membership.is_none() && !is_lecturer_or_admin;
        let can_join_group = can_manage_groups && my_membership.is_none() && !is_lecturer_or_admin;

        let (class_start, class_end) =
            DeadlineService::resolve_class_window(&deadline, class_id, pool).await;

        Ok(WorkspaceDTO {
            deadline_id,
            deadline_name: deadline.name,
            deadline_description: deadline.description,
            deadline_status: deadline_status.as_str().to_string(),
            deadline_start_time: class_start,
            deadline_end_time: class_end,
            deadline_expired,
            read_only_reason,
            can_manage_groups,
            school_class_id: class_id,
            school_class_name: school_class.name,
            lecturer_id: school_class.lecturer_id,
            rules_version: school_class.rules_version,
            my_group,
            is_leader,
            groups: group_dtos,
            unassigned_students,
            rules: class_rules,
            can_create_group,
            can_join_group,
            is_lecturer: is_lecturer_or_admin,
        })
    }

    pub async fn get_group_detail(
        pool: &MySqlPool,
        group_id: i64,
        class_id: i32,
        _deadline_id: i32,
    ) -> Result<GroupDTO, AppError> {
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);

        Self::build_group_dto(pool, &group, &class_rules, max_members, None).await
    }

    pub async fn create_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        request: CreateGroupRequest,
    ) -> Result<GroupDTO, AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let student_id = auth.id;
        if GroupMemberRepository::find_by_student_id_and_deadline_id(pool, student_id, deadline_id)
            .await?
            .is_some()
        {
            return Err(AppError::conflict(
                "Bạn đã tham gia một nhóm trong đợt này rồi.",
                "group",
                "ERR_ALREADY_IN_GROUP",
            ));
        }

        Self::require_group_capacity(pool, class_id, deadline_id).await?;

        let clean_name = request.name.trim();
        if clean_name.is_empty() || clean_name.len() < 2 || clean_name.len() > 100 {
            return Err(AppError::bad_request(
                "Tên nhóm phải từ 2 đến 100 ký tự",
                "group",
                "invalidName",
            ));
        }

        if GroupRepository::exists_by_name(
            pool,
            class_id,
            deadline_id,
            clean_name,
            GroupStatus::DISBANDED.as_str(),
        )
        .await?
        {
            return Err(AppError::conflict(
                "Tên nhóm này đã tồn tại trong lớp học.",
                "group",
                "ERR_GROUP_NAME_EXISTS",
            ));
        }

        let next_seq = Self::compact_group_sequence(pool, class_id, deadline_id).await? + 1;

        let group = GroupRepository::create_group(
            pool,
            deadline_id,
            class_id,
            clean_name,
            student_id,
            GroupStatus::OPEN.as_str(),
            false,
            Some(next_seq),
            Some(&auth.email),
        )
        .await?;

        GroupMemberRepository::add_member(
            pool,
            group.id,
            student_id,
            deadline_id,
            class_id,
            GroupMemberRole::LEADER.as_str(),
        )
        .await?;

        GroupInvitationRepository::cancel_all_pending_for_student_in_deadline(
            pool,
            student_id,
            deadline_id,
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group.id,
            student_id,
            deadline_id,
            "JOINED",
            &auth.email,
            Some("Tạo nhóm mới"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_CREATED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn join_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let student_id = auth.id;
        if GroupMemberRepository::find_by_student_id_and_deadline_id(pool, student_id, deadline_id)
            .await?
            .is_some()
        {
            return Err(AppError::conflict(
                "Bạn đã tham gia một nhóm trong đợt này rồi.",
                "group",
                "ERR_ALREADY_IN_GROUP",
            ));
        }

        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.status != GroupStatus::OPEN.as_str() {
            return Err(AppError::conflict(
                "Nhóm hiện không ở trạng thái mở để tham gia.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);
        let current_count = GroupMemberRepository::count_by_group_id(pool, group_id).await?;
        if (current_count as i32) >= max_members {
            return Err(AppError::conflict(
                format!("Nhóm đã đủ số lượng thành viên tối đa ({}).", max_members),
                "group",
                "ERR_GROUP_FULL",
            ));
        }

        let mut proposed =
            GroupMemberRepository::find_member_details_by_group_id(pool, group_id).await?;
        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let student = class_students
            .iter()
            .find(|s| s.user_id == student_id)
            .ok_or_else(|| {
                AppError::not_found("Student not found", "student", "studentNotFound")
            })?;

        proposed.push(GroupMemberDTO {
            id: 0,
            group_id,
            student_id,
            roll_number: Some(student.roll_number.clone()),
            full_name: Some(student.full_name.clone()),
            email: Some(student.email.clone()),
            member_code: student.member_code.clone(),
            cohort: student.cohort.clone(),
            slot_type: student.slot_type.clone(),
            major_id: student.major_id,
            major_code: student.major_code.clone(),
            major_name: student.major_name.clone(),
            role: GroupMemberRole::MEMBER,
            joined_at: None,
            self_description: student.self_description.clone(),
            match_score: None,
            match_reasons: Vec::new(),
        });

        if !GroupRuleValidationService::are_formation_rules_passed(&class_rules, &proposed) {
            return Err(AppError::unprocessable(
                "Không thể tham gia vì nhóm đã vi phạm quy định ghép nhóm của lớp.",
                "group",
                "ERR_HARD_RULE_VIOLATED",
            ));
        }

        GroupMemberRepository::add_member(
            pool,
            group_id,
            student_id,
            deadline_id,
            class_id,
            GroupMemberRole::MEMBER.as_str(),
        )
        .await?;

        GroupInvitationRepository::cancel_all_pending_for_student_in_deadline(
            pool,
            student_id,
            deadline_id,
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            student_id,
            deadline_id,
            "JOINED",
            &auth.email,
            Some("Gia nhập nhóm"),
        )
        .await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_JOINED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::Value::Null,
        };
        let _ = event_sender.send(event);

        Self::get_group_detail(pool, group_id, class_id, deadline_id).await
    }

    pub async fn leave_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<(), AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let student_id = auth.id;
        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.status != GroupStatus::OPEN.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể rời nhóm khi nhóm đang ở trạng thái mở.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        if GroupMemberRepository::find_by_group_id_and_student_id(pool, group_id, student_id)
            .await?
            .is_none()
        {
            return Err(AppError::forbidden(
                "Bạn không phải thành viên của nhóm này.",
                "group",
                "ERR_FORBIDDEN_NOT_MEMBER",
            ));
        }

        let members = GroupMemberRepository::find_by_group_id(pool, group_id).await?;
        if group.leader_id == student_id {
            if members.len() > 1 {
                return Err(AppError::conflict(
                    "Trưởng nhóm không thể rời nhóm trước khi chuyển quyền trưởng nhóm hoặc giải tán nhóm.",
                    "group",
                    "ERR_LEADER_CANNOT_LEAVE",
                ));
            } else {
                return Self::disband_group(
                    pool,
                    event_sender,
                    auth,
                    deadline_id,
                    class_id,
                    group_id,
                )
                .await;
            }
        }

        GroupMemberRepository::delete_by_group_id_and_student_id(pool, group_id, student_id)
            .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            student_id,
            deadline_id,
            "LEFT",
            &auth.email,
            Some("Rời nhóm"),
        )
        .await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_LEFT".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::Value::Null,
        };
        let _ = event_sender.send(event);

        Ok(())
    }

    pub async fn transfer_leader(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        request: TransferLeaderRequest,
    ) -> Result<GroupDTO, AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let current_user_id = auth.id;
        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.leader_id != current_user_id {
            return Err(AppError::forbidden(
                "Chỉ có trưởng nhóm mới có quyền chuyển quyền trưởng nhóm.",
                "group",
                "ERR_FORBIDDEN_NOT_LEADER",
            ));
        }

        if group.status != GroupStatus::OPEN.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể chuyển quyền khi nhóm đang ở trạng thái mở.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let new_leader_id = request.new_leader_id;
        if GroupMemberRepository::find_by_group_id_and_student_id(pool, group_id, new_leader_id)
            .await?
            .is_none()
        {
            return Err(AppError::bad_request(
                "Sinh viên được chỉ định không thuộc nhóm này.",
                "group",
                "ERR_TARGET_NOT_MEMBER",
            ));
        }

        GroupRepository::update_group(
            pool,
            group.id,
            &group.name,
            new_leader_id,
            &group.status,
            group.reject_reason.as_deref(),
            group.submitted_rules_version,
            group.rules_evaluation_snapshot.as_deref(),
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupMemberRepository::update_role(
            pool,
            group_id,
            current_user_id,
            GroupMemberRole::MEMBER.as_str(),
        )
        .await?;
        GroupMemberRepository::update_role(
            pool,
            group_id,
            new_leader_id,
            GroupMemberRole::LEADER.as_str(),
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            new_leader_id,
            deadline_id,
            "ROLE_CHANGED",
            &auth.email,
            Some("Chuyển quyền trưởng nhóm"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "LEADER_TRANSFERRED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn submit_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let current_user_id = auth.id;
        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.leader_id != current_user_id {
            return Err(AppError::forbidden(
                "Chỉ có trưởng nhóm mới có quyền nộp danh sách nhóm.",
                "group",
                "ERR_FORBIDDEN_NOT_LEADER",
            ));
        }

        if !Self::is_draft(&group.status) {
            return Err(AppError::conflict(
                "Chỉ có thể nộp nhóm khi đang ở trạng thái OPEN.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        let evaluations = Self::evaluate_complete_group(pool, &group).await?;
        let snapshot = GroupRuleValidationService::serialize_snapshot(&evaluations);
        let previous_status = group.status.clone();
        let seq = group
            .sequence_no
            .unwrap_or(Self::compact_group_sequence(pool, class_id, deadline_id).await? + 1);

        GroupRepository::update_status_with_rules(
            pool,
            group.id,
            GroupStatus::PENDING.as_str(),
            None,
            Some(school_class.rules_version),
            Some(&snapshot),
            Some(seq),
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupHistoryRepository::log_status_history(
            pool,
            group_id,
            &previous_status,
            GroupStatus::PENDING.as_str(),
            &auth.email,
            None,
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_SUBMITTED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn cancel_submit_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let current_user_id = auth.id;
        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.leader_id != current_user_id {
            return Err(AppError::forbidden(
                "Chỉ có trưởng nhóm mới có quyền hủy nộp danh sách nhóm.",
                "group",
                "ERR_FORBIDDEN_NOT_LEADER",
            ));
        }

        if group.status != GroupStatus::PENDING.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể hủy nộp khi nhóm đang ở trạng thái chờ duyệt.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        GroupRepository::update_status(
            pool,
            group.id,
            GroupStatus::OPEN.as_str(),
            None,
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupHistoryRepository::log_status_history(
            pool,
            group_id,
            GroupStatus::PENDING.as_str(),
            GroupStatus::OPEN.as_str(),
            &auth.email,
            None,
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_SUBMIT_CANCELLED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn disband_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<(), AppError> {
        Self::validate_deadline_active(pool, deadline_id, class_id).await?;

        let current_user_id = auth.id;
        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.leader_id != current_user_id {
            return Err(AppError::forbidden(
                "Chỉ có trưởng nhóm mới có quyền giải tán nhóm.",
                "group",
                "ERR_FORBIDDEN_NOT_LEADER",
            ));
        }

        if group.status != GroupStatus::OPEN.as_str() {
            return Err(AppError::conflict(
                "Không thể giải tán nhóm đang chờ duyệt hoặc đã được duyệt.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        GroupRepository::update_status(
            pool,
            group.id,
            GroupStatus::DISBANDED.as_str(),
            None,
            None,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupMemberRepository::delete_by_group_id(pool, group_id).await?;

        sqlx::query(
            "UPDATE group_invitations SET status = 'CANCELLED', responded_at = NOW() WHERE group_id = ? AND status = 'PENDING'",
        )
        .bind(group_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to cancel group invitations: {e}")))?;

        GroupHistoryRepository::log_status_history(
            pool,
            group_id,
            GroupStatus::OPEN.as_str(),
            GroupStatus::DISBANDED.as_str(),
            &auth.email,
            Some("Trưởng nhóm giải tán nhóm"),
        )
        .await?;

        Self::compact_group_sequence(pool, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_DISBANDED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::Value::Null,
        };
        let _ = event_sender.send(event);

        Ok(())
    }

    // ==========================================
    // LECTURER ACTIONS
    // ==========================================

    pub async fn lecturer_create_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        request: LecturerCreateGroupRequest,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Deadline not found", "deadline", "ERR_DEADLINE_NOT_FOUND")
            })?;
        let _ = deadline;
        Self::require_group_capacity(pool, class_id, deadline_id).await?;

        let clean_name = request.name.trim();
        if clean_name.is_empty() || clean_name.len() < 2 || clean_name.len() > 100 {
            return Err(AppError::bad_request(
                "Tên nhóm phải từ 2 đến 100 ký tự",
                "group",
                "invalidName",
            ));
        }

        if GroupRepository::exists_by_name(
            pool,
            class_id,
            deadline_id,
            clean_name,
            GroupStatus::DISBANDED.as_str(),
        )
        .await?
        {
            return Err(AppError::conflict(
                "Tên nhóm này đã tồn tại trong lớp học.",
                "group",
                "ERR_GROUP_NAME_EXISTS",
            ));
        }

        if request.student_ids.is_empty() {
            return Err(AppError::bad_request(
                "Danh sách sinh viên không được rỗng",
                "group",
                "ERR_EMPTY_STUDENTS",
            ));
        }

        let mut seen = std::collections::HashSet::new();
        for sid in &request.student_ids {
            if !seen.insert(*sid) {
                return Err(AppError::bad_request(
                    "Duplicate students",
                    "group",
                    "ERR_ALREADY_IN_GROUP",
                ));
            }
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let student_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        for sid in &request.student_ids {
            if !student_map.contains_key(sid) {
                return Err(AppError::bad_request(
                    format!("Sinh viên ID {} không thuộc lớp học này", sid),
                    "group",
                    "ERR_STUDENT_NOT_IN_CLASS",
                ));
            }
            if GroupMemberRepository::find_by_student_id_and_deadline_id(pool, *sid, deadline_id)
                .await?
                .is_some()
            {
                let s_name = student_map.get(sid).map(|s| s.full_name.as_str()).unwrap_or("");
                return Err(AppError::conflict(
                    format!("Sinh viên {} đã thuộc nhóm khác.", s_name),
                    "group",
                    "ERR_ALREADY_IN_GROUP",
                ));
            }
        }

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);
        if request.student_ids.len() > max_members as usize {
            return Err(AppError::conflict(
                "Group is full",
                "group",
                "ERR_GROUP_FULL",
            ));
        }

        let leader_id = request.student_ids[0];
        let next_seq = Self::compact_group_sequence(pool, class_id, deadline_id).await? + 1;

        let proposed_members: Vec<GroupMemberDTO> = request
            .student_ids
            .iter()
            .enumerate()
            .map(|(idx, sid)| {
                let s = student_map.get(sid).unwrap();
                GroupMemberDTO {
                    id: 0,
                    group_id: 0,
                    student_id: *sid,
                    roll_number: Some(s.roll_number.clone()),
                    full_name: Some(s.full_name.clone()),
                    email: Some(s.email.clone()),
                    member_code: s.member_code.clone(),
                    cohort: s.cohort.clone(),
                    slot_type: s.slot_type.clone(),
                    major_id: s.major_id,
                    major_code: s.major_code.clone(),
                    major_name: s.major_name.clone(),
                    role: if idx == 0 {
                        GroupMemberRole::LEADER
                    } else {
                        GroupMemberRole::MEMBER
                    },
                    joined_at: None,
                    self_description: s.self_description.clone(),
                    match_score: None,
                    match_reasons: Vec::new(),
                }
            })
            .collect();

        if !GroupRuleValidationService::are_formation_rules_passed(&class_rules, &proposed_members) {
            return Err(AppError::unprocessable(
                "Draft exceeds active maximum rules",
                "group",
                "ERR_HARD_RULE_VIOLATED",
            ));
        }

        let evals = GroupRuleValidationService::evaluate_rules(&class_rules, &proposed_members);
        let snapshot = GroupRuleValidationService::serialize_snapshot(&evals);

        let group = GroupRepository::create_group(
            pool,
            deadline_id,
            class_id,
            clean_name,
            leader_id,
            GroupStatus::OPEN.as_str(),
            true,
            Some(next_seq),
            Some(&auth.email),
        )
        .await?;

        sqlx::query("UPDATE `groups` SET rules_evaluation_snapshot = ?, submitted_rules_version = ? WHERE id = ?")
            .bind(&snapshot)
            .bind(school_class.rules_version)
            .bind(group.id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to set snapshot: {e}")))?;

        for (idx, sid) in request.student_ids.iter().enumerate() {
            let role = if idx == 0 {
                GroupMemberRole::LEADER
            } else {
                GroupMemberRole::MEMBER
            };
            GroupMemberRepository::add_member(
                pool,
                group.id,
                *sid,
                deadline_id,
                class_id,
                role.as_str(),
            )
            .await?;
            GroupInvitationRepository::cancel_all_pending_for_student_in_deadline(
                pool,
                *sid,
                deadline_id,
            )
            .await?;
            GroupHistoryRepository::log_member_history(
                pool,
                group.id,
                *sid,
                deadline_id,
                "ASSIGNED_BY_LECTURER",
                &auth.email,
                Some("Giảng viên phân công vào nhóm"),
            )
            .await?;
        }

        if let Some(reason) = &request.override_reason {
            if !reason.trim().is_empty() {
                GroupHistoryRepository::log_rule_override(
                    pool,
                    group.id,
                    &auth.email,
                    &snapshot,
                    reason.trim(),
                )
                .await?;
            }
        }

        GroupHistoryRepository::log_status_history(
            pool,
            group.id,
            GroupStatus::OPEN.as_str(),
            GroupStatus::OPEN.as_str(),
            &auth.email,
            Some("Lecturer created draft for allocation"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_CREATED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn lecturer_submit_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        Self::require_staff_editable(&group)?;

        let (evaluations, snapshot) = Self::capture_staff_review_snapshot(pool, &group).await?;
        let previous_status = group.status.clone();

        let seq = group
            .sequence_no
            .unwrap_or(Self::compact_group_sequence(pool, class_id, deadline_id).await? + 1);

        GroupRepository::update_status_with_rules(
            pool,
            group.id,
            GroupStatus::PENDING.as_str(),
            None,
            Some(school_class.rules_version),
            Some(&snapshot),
            Some(seq),
            group.version,
            Some(&auth.email),
        )
        .await?;

        let reason = Self::review_audit_reason("Submitted for review by lecturer", &evaluations);

        GroupHistoryRepository::log_status_history(
            pool,
            group.id,
            &previous_status,
            GroupStatus::PENDING.as_str(),
            &auth.email,
            Some(&reason),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_SUBMITTED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn lecturer_move_member(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        source_group_id: i64,
        target_group_id: i64,
        student_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let source_group = GroupRepository::find_by_id(pool, source_group_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Source group not found", "group", "groupNotFound")
            })?;
        let target_group = GroupRepository::find_by_id(pool, target_group_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Target group not found", "group", "groupNotFound")
            })?;

        if source_group.status != GroupStatus::OPEN.as_str()
            || target_group.status != GroupStatus::OPEN.as_str()
        {
            return Err(AppError::conflict(
                "Only open groups can have members moved",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        GroupMemberRepository::delete_by_group_id_and_student_id(pool, source_group_id, student_id)
            .await?;

        // If student was source leader, reassign leader
        if source_group.leader_id == student_id {
            let remaining = GroupMemberRepository::find_by_group_id(pool, source_group_id).await?;
            if let Some(first) = remaining.first() {
                GroupRepository::update_group(
                    pool,
                    source_group.id,
                    &source_group.name,
                    first.student_id,
                    &source_group.status,
                    source_group.reject_reason.as_deref(),
                    source_group.submitted_rules_version,
                    source_group.rules_evaluation_snapshot.as_deref(),
                    source_group.sequence_no,
                    source_group.version,
                    Some(&auth.email),
                )
                .await?;
                GroupMemberRepository::update_role(
                    pool,
                    source_group_id,
                    first.student_id,
                    GroupMemberRole::LEADER.as_str(),
                )
                .await?;
            }
        }

        GroupMemberRepository::add_member(
            pool,
            target_group_id,
            student_id,
            deadline_id,
            class_id,
            GroupMemberRole::MEMBER.as_str(),
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            target_group_id,
            student_id,
            deadline_id,
            "MOVED",
            &auth.email,
            Some(&format!(
                "Chuyển từ nhóm {} sang nhóm {}",
                source_group.name, target_group.name
            )),
        )
        .await?;

        let dto = Self::get_group_detail(pool, target_group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_MOVED".to_string(),
            group_id: Some(target_group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn accept_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::PENDING.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể phê duyệt nhóm đang ở trạng thái PENDING.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let (evaluations, snapshot) = Self::capture_staff_review_snapshot(pool, &group).await?;

        GroupRepository::update_status_with_rules(
            pool,
            group.id,
            GroupStatus::ACCEPTED.as_str(),
            None,
            Some(school_class.rules_version),
            Some(&snapshot),
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        let reason =
            Self::review_audit_reason("Giảng viên chấp thuận cơ cấu thành viên nhóm", &evaluations);

        GroupHistoryRepository::log_status_history(
            pool,
            group.id,
            GroupStatus::PENDING.as_str(),
            GroupStatus::ACCEPTED.as_str(),
            &auth.email,
            Some(&reason),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_ACCEPTED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn reject_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        request: RejectGroupRequest,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::PENDING.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể từ chối nhóm đang ở trạng thái chờ duyệt.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let clean_reason = request.reason.trim();
        if clean_reason.is_empty() {
            return Err(AppError::bad_request(
                "Lý do từ chối không được để trống",
                "group",
                "emptyReason",
            ));
        }

        GroupRepository::update_status(
            pool,
            group.id,
            GroupStatus::OPEN.as_str(),
            Some(clean_reason),
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupHistoryRepository::log_status_history(
            pool,
            group.id,
            GroupStatus::PENDING.as_str(),
            GroupStatus::OPEN.as_str(),
            &auth.email,
            Some(clean_reason),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_REJECTED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn revoke_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id_for_update(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::ACCEPTED.as_str() {
            return Err(AppError::conflict(
                "Chỉ có thể thu hồi nhóm đã được phê duyệt.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        GroupRepository::update_status(
            pool,
            group.id,
            GroupStatus::REVOKED.as_str(),
            None,
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupHistoryRepository::log_status_history(
            pool,
            group.id,
            GroupStatus::ACCEPTED.as_str(),
            GroupStatus::REVOKED.as_str(),
            &auth.email,
            Some("Giảng viên thu hồi phê duyệt nhóm"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group.id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_REVOKED".to_string(),
            group_id: Some(group.id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn lecturer_add_member(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        student_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::OPEN.as_str()
            && group.status != GroupStatus::REVOKED.as_str()
        {
            return Err(AppError::conflict(
                "Chỉ có thể thêm thành viên vào nhóm nháp (OPEN hoặc REVOKED).",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        if GroupMemberRepository::find_by_student_id_and_deadline_id(pool, student_id, deadline_id)
            .await?
            .is_some()
        {
            return Err(AppError::conflict(
                "Sinh viên này đã tham gia một nhóm khác.",
                "group",
                "ERR_ALREADY_IN_GROUP",
            ));
        }

        GroupMemberRepository::add_member(
            pool,
            group_id,
            student_id,
            deadline_id,
            class_id,
            GroupMemberRole::MEMBER.as_str(),
        )
        .await?;

        GroupInvitationRepository::cancel_all_pending_for_student_in_deadline(
            pool,
            student_id,
            deadline_id,
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            student_id,
            deadline_id,
            "JOINED",
            &auth.email,
            Some("Giảng viên thêm sinh viên vào nhóm"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_JOINED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn lecturer_remove_member(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        student_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status != GroupStatus::OPEN.as_str()
            && group.status != GroupStatus::REVOKED.as_str()
        {
            return Err(AppError::conflict(
                "Chỉ có thể xóa thành viên khỏi nhóm nháp (OPEN hoặc REVOKED).",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        GroupMemberRepository::delete_by_group_id_and_student_id(pool, group_id, student_id)
            .await?;

        if group.leader_id == student_id {
            let remaining = GroupMemberRepository::find_by_group_id(pool, group_id).await?;
            if let Some(first) = remaining.first() {
                GroupRepository::update_group(
                    pool,
                    group.id,
                    &group.name,
                    first.student_id,
                    &group.status,
                    group.reject_reason.as_deref(),
                    group.submitted_rules_version,
                    group.rules_evaluation_snapshot.as_deref(),
                    group.sequence_no,
                    group.version,
                    Some(&auth.email),
                )
                .await?;
                GroupMemberRepository::update_role(
                    pool,
                    group_id,
                    first.student_id,
                    GroupMemberRole::LEADER.as_str(),
                )
                .await?;
            }
        }

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            student_id,
            deadline_id,
            "LEFT",
            &auth.email,
            Some("Giảng viên xóa sinh viên khỏi nhóm"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_LEFT".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn lecturer_set_leader(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        student_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if GroupMemberRepository::find_by_group_id_and_student_id(pool, group_id, student_id)
            .await?
            .is_none()
        {
            return Err(AppError::bad_request(
                "Sinh viên không thuộc nhóm này",
                "group",
                "ERR_TARGET_NOT_MEMBER",
            ));
        }

        let old_leader_id = group.leader_id;

        GroupRepository::update_group(
            pool,
            group.id,
            &group.name,
            student_id,
            &group.status,
            group.reject_reason.as_deref(),
            group.submitted_rules_version,
            group.rules_evaluation_snapshot.as_deref(),
            group.sequence_no,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupMemberRepository::update_role(
            pool,
            group_id,
            old_leader_id,
            GroupMemberRole::MEMBER.as_str(),
        )
        .await?;
        GroupMemberRepository::update_role(
            pool,
            group_id,
            student_id,
            GroupMemberRole::LEADER.as_str(),
        )
        .await?;

        GroupHistoryRepository::log_member_history(
            pool,
            group_id,
            student_id,
            deadline_id,
            "ROLE_CHANGED",
            &auth.email,
            Some("Giảng viên chỉ định làm trưởng nhóm"),
        )
        .await?;

        let dto = Self::get_group_detail(pool, group_id, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "LEADER_TRANSFERRED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::to_value(&dto).unwrap_or_default(),
        };
        let _ = event_sender.send(event);

        Ok(dto)
    }

    pub async fn lecturer_disband_group(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<(), AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;
        SchoolClassService::require_write_access(auth, &school_class)?;

        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        GroupRepository::update_status(
            pool,
            group.id,
            GroupStatus::DISBANDED.as_str(),
            None,
            None,
            group.version,
            Some(&auth.email),
        )
        .await?;

        GroupMemberRepository::delete_by_group_id(pool, group_id).await?;

        sqlx::query(
            "UPDATE group_invitations SET status = 'CANCELLED', responded_at = NOW() WHERE group_id = ? AND status = 'PENDING'",
        )
        .bind(group_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to cancel group invitations: {e}")))?;

        GroupHistoryRepository::log_status_history(
            pool,
            group_id,
            &group.status,
            GroupStatus::DISBANDED.as_str(),
            &auth.email,
            Some("Giảng viên giải tán nhóm"),
        )
        .await?;

        Self::compact_group_sequence(pool, class_id, deadline_id).await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_DISBANDED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::Value::Null,
        };
        let _ = event_sender.send(event);

        Ok(())
    }

    // ==========================================
    // REVIEWS
    // ==========================================

    #[allow(clippy::too_many_arguments)]
    pub async fn get_my_group_reviews(
        pool: &MySqlPool,
        auth: &AuthUser,
        term_id: i32,
        class_id: Option<i32>,
        status: Option<&str>,
        search: Option<&str>,
        page: u64,
        size: u64,
    ) -> Result<ResultPaginationDTO<GroupReviewDTO>, AppError> {
        let is_admin_or_master =
            auth.is_admin() || auth.has_role(AuthoritiesConstants::LECTURE_MASTER);

        let allowed_classes = if is_admin_or_master {
            SchoolClassRepository::find_by_term_id(pool, term_id).await?
        } else {
            SchoolClassRepository::find_by_lecturer_id_and_term_id(pool, auth.id, term_id).await?
        };

        let allowed_ids: Vec<i32> = allowed_classes.iter().map(|c| c.id).collect();
        let class_map: HashMap<i32, String> = allowed_classes
            .into_iter()
            .map(|c| (c.id, c.name))
            .collect();

        let offset = page.saturating_sub(1) * size;
        let (groups, total) = GroupRepository::search_group_reviews(
            pool,
            term_id,
            class_id,
            status,
            search,
            &allowed_ids,
            offset,
            size,
        )
        .await?;

        let mut review_dtos = Vec::new();
        let now = Utc::now();

        for g in groups {
            let class_name = class_map
                .get(&g.school_class_id)
                .cloned()
                .unwrap_or_default();
            let submitted_at =
                GroupHistoryRepository::find_latest_submission_time(pool, g.id).await?;

            let deadline = DeadlineRepository::find_by_id(pool, g.deadline_id).await?;
            let deadline_status = if let Some(ref d) = deadline {
                DeadlineService::resolve_deadline_status_for_class(pool, d, g.school_class_id, now)
                    .await
            } else {
                DeadlineStatus::UNSCHEDULED
            };

            let membership_valid = Self::evaluate_review_group(pool, &g).await.is_ok();
            let writable = DeadlineRepository::find_all_by_school_class_id(pool, g.school_class_id)
                .await?
                .len() == 1;
            let group_dto = Self::get_group_detail(pool, g.id, g.school_class_id, g.deadline_id).await?;
            let eligible = membership_valid && group_dto.all_rules_passed;
            let can_review = writable && membership_valid && g.status == GroupStatus::PENDING.as_str();
            let can_reopen = writable && g.status == GroupStatus::ACCEPTED.as_str();

            review_dtos.push(GroupReviewDTO {
                group: group_dto,
                class_name,
                submitted_at,
                deadline_status: deadline_status.as_str().to_string(),
                eligible,
                can_review,
                can_reopen,
            });
        }

        Ok(ResultPaginationDTO::new(
            review_dtos,
            total,
            page as i64,
            size as i64,
        ))
    }

    // ==========================================
    // HELPERS
    // ==========================================

    async fn validate_deadline_active(
        pool: &MySqlPool,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<(), AppError> {
        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    "Không tìm thấy đợt hạn này",
                    "deadline",
                    "ERR_DEADLINE_NOT_FOUND",
                )
            })?;

        let status = DeadlineService::resolve_deadline_status_for_class(
            pool,
            &deadline,
            class_id,
            Utc::now(),
        )
        .await;
        if status != DeadlineStatus::ACTIVE {
            return Err(AppError::conflict(
                "Đợt hạn không ở trạng thái mở.",
                "deadline",
                "ERR_DEADLINE_NOT_ACTIVE",
            ));
        }
        Ok(())
    }

    async fn require_group_capacity(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
    ) -> Result<(), AppError> {
        let all_groups =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?;
        let active_count = all_groups
            .iter()
            .filter(|g| g.status != GroupStatus::DISBANDED.as_str())
            .count() as i32;

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let full = class_rules.iter().any(|r| {
            r.code == crate::domain::GroupingRuleCode::MAX_GROUPS_PER_CLASS
                && r.status
                && active_count >= r.value
        });

        if full {
            return Err(AppError::unprocessable(
                "Class reached its configured group maximum",
                "group",
                "ERR_HARD_RULE_VIOLATED",
            ));
        }
        Ok(())
    }

    async fn compact_group_sequence(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
    ) -> Result<i32, AppError> {
        let groups =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?;
        let mut sequence = 0;
        for group in groups {
            let target = if group.status == GroupStatus::DISBANDED.as_str() {
                None
            } else {
                sequence += 1;
                Some(sequence)
            };

            if group.sequence_no != target {
                sqlx::query("UPDATE `groups` SET sequence_no = ? WHERE id = ?")
                    .bind(target)
                    .bind(group.id)
                    .execute(pool)
                    .await
                    .map_err(|e| AppError::Internal(format!("Failed to compact sequence: {e}")))?;
            }
        }
        Ok(sequence)
    }

    pub fn is_draft(status: &str) -> bool {
        status == GroupStatus::OPEN.as_str() || status == GroupStatus::REVOKED.as_str()
    }

    pub fn require_staff_editable(group: &Group) -> Result<(), AppError> {
        if !Self::is_draft(&group.status) {
            return Err(AppError::conflict(
                "Only draft groups can be edited. Unlock approved groups or reject pending groups first.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }
        Ok(())
    }

    pub fn with_class_group_rules(
        composition: Vec<GroupRuleEvaluationDTO>,
        rules: &[GroupingRuleDTO],
        group_count: i64,
    ) -> Vec<GroupRuleEvaluationDTO> {
        let mut evaluations = composition;
        for rule in rules {
            if rule.status
                && (rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS
                    || rule.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS)
            {
                let passed = if rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS {
                    group_count >= rule.value as i64
                } else {
                    group_count <= rule.value as i64
                };
                let message = if passed {
                    format!("Quy định {} đạt yêu cầu", rule.code.as_str())
                } else {
                    format!("Quy định {} chưa đạt yêu cầu", rule.code.as_str())
                };
                evaluations.push(GroupRuleEvaluationDTO {
                    code: rule.code.clone(),
                    rule_name: rule.code.as_str().to_string(),
                    hard_rule: false,
                    target_value: rule.value,
                    actual_value: group_count as i32,
                    passed,
                    message,
                });
            }
        }
        evaluations
    }

    pub async fn evaluate_current_group_rules(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
        members: &[GroupMemberDTO],
    ) -> Result<Vec<GroupRuleEvaluationDTO>, AppError> {
        let rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let has_count_rules = rules.iter().any(|r| {
            r.status
                && (r.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS
                    || r.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS)
        });
        let group_count = if has_count_rules {
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?
                .into_iter()
                .filter(|g| g.status != GroupStatus::DISBANDED.as_str())
                .count() as i64
        } else {
            0
        };
        let composition = GroupRuleValidationService::evaluate_rules(&rules, members);
        Ok(Self::with_class_group_rules(composition, &rules, group_count))
    }

    pub async fn evaluate_review_group(
        pool: &MySqlPool,
        group: &Group,
    ) -> Result<Vec<GroupRuleEvaluationDTO>, AppError> {
        let rows =
            StudentRepository::find_students_by_school_class_id(pool, group.school_class_id).await?;
        let students_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            rows.iter().map(|s| (s.user_id, s)).collect();
        let stored_members = GroupMemberRepository::find_by_group_id(pool, group.id).await?;

        let has_invalid_member = stored_members.iter().any(|m| {
            !students_map.contains_key(&m.student_id)
                || m.school_class_id != group.school_class_id
                || m.deadline_id != group.deadline_id
        });
        let distinct_count: HashSet<i64> = stored_members.iter().map(|m| m.student_id).collect();
        let leader_count = stored_members
            .iter()
            .filter(|m| m.role == GroupMemberRole::LEADER.as_str())
            .count();
        let leader_matches = stored_members.iter().any(|m| {
            m.role == GroupMemberRole::LEADER.as_str() && m.student_id == group.leader_id
        });

        if stored_members.is_empty()
            || has_invalid_member
            || distinct_count.len() != stored_members.len()
            || leader_count != 1
            || !leader_matches
        {
            return Err(AppError::conflict(
                "Invalid group membership or leader",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        let members: Vec<GroupMemberDTO> = stored_members
            .into_iter()
            .map(|m| {
                let s = students_map.get(&m.student_id);
                GroupMemberDTO {
                    id: m.id,
                    group_id: m.group_id,
                    student_id: m.student_id,
                    roll_number: s.map(|x| x.roll_number.clone()),
                    full_name: s.map(|x| x.full_name.clone()),
                    email: s.map(|x| x.email.clone()),
                    member_code: s.and_then(|x| x.member_code.clone()),
                    cohort: s.and_then(|x| x.cohort.clone()),
                    slot_type: s.and_then(|x| x.slot_type.clone()),
                    major_id: s.and_then(|x| x.major_id),
                    major_code: s.and_then(|x| x.major_code.clone()),
                    major_name: s.and_then(|x| x.major_name.clone()),
                    role: if m.role == GroupMemberRole::LEADER.as_str() {
                        GroupMemberRole::LEADER
                    } else {
                        GroupMemberRole::MEMBER
                    },
                    joined_at: Some(m.joined_at),
                    self_description: s.and_then(|x| x.self_description.clone()),
                    match_score: None,
                    match_reasons: Vec::new(),
                }
            })
            .collect();

        Self::evaluate_current_group_rules(
            pool,
            group.school_class_id,
            group.deadline_id,
            &members,
        )
        .await
    }

    pub async fn capture_staff_review_snapshot(
        pool: &MySqlPool,
        group: &Group,
    ) -> Result<(Vec<GroupRuleEvaluationDTO>, String), AppError> {
        let evaluations = Self::evaluate_review_group(pool, group).await?;
        let snapshot = GroupRuleValidationService::serialize_snapshot(&evaluations);
        Ok((evaluations, snapshot))
    }

    pub async fn evaluate_complete_group(
        pool: &MySqlPool,
        group: &Group,
    ) -> Result<Vec<GroupRuleEvaluationDTO>, AppError> {
        let evaluations = Self::evaluate_review_group(pool, group).await?;
        if !GroupRuleValidationService::are_all_rules_passed(&evaluations) {
            return Err(AppError::unprocessable(
                "Group rules must pass before student submission",
                "group",
                "ERR_HARD_RULE_VIOLATED",
            ));
        }
        Ok(evaluations)
    }

    pub async fn require_complete_group(
        pool: &MySqlPool,
        group: &Group,
    ) -> Result<Vec<GroupRuleEvaluationDTO>, AppError> {
        let evaluations = Self::evaluate_complete_group(pool, group).await?;
        let snapshot = GroupRuleValidationService::serialize_snapshot(&evaluations);
        sqlx::query("UPDATE `groups` SET rules_evaluation_snapshot = ? WHERE id = ?")
            .bind(&snapshot)
            .bind(group.id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save rules evaluation snapshot: {e}")))?;
        Ok(evaluations)
    }

    pub fn review_audit_reason(reason: &str, evaluations: &[GroupRuleEvaluationDTO]) -> String {
        let warnings: Vec<&str> = evaluations
            .iter()
            .filter(|rule| !rule.passed)
            .map(|rule| rule.code.as_str())
            .collect();
        if warnings.is_empty() {
            reason.to_string()
        } else {
            format!("{}; Rule warnings: {}", reason, warnings.join(", "))
        }
    }

    async fn build_group_dto(
        pool: &MySqlPool,
        group: &Group,
        class_rules: &[crate::dto::rule::GroupingRuleDTO],
        max_members: i32,
        active_group_count: Option<i64>,
    ) -> Result<GroupDTO, AppError> {
        let members =
            GroupMemberRepository::find_member_details_by_group_id(pool, group.id).await?;
        let evals = if let Some(count) = active_group_count {
            let comp = GroupRuleValidationService::evaluate_rules(class_rules, &members);
            Self::with_class_group_rules(comp, class_rules, count)
        } else {
            Self::evaluate_current_group_rules(pool, group.school_class_id, group.deadline_id, &members).await?
        };
        let all_passed = GroupRuleValidationService::are_all_rules_passed(&evals);
        let has_hard_violations = GroupRuleValidationService::has_hard_rule_violations(&evals);

        let leader_name = UserRepository::find_by_id(pool, group.leader_id)
            .await?
            .and_then(|u| u.name);

        let status = match group.status.as_str() {
            "PENDING" => GroupStatus::PENDING,
            "ACCEPTED" => GroupStatus::ACCEPTED,
            "REVOKED" => GroupStatus::REVOKED,
            "DISBANDED" => GroupStatus::DISBANDED,
            _ => GroupStatus::OPEN,
        };

        Ok(GroupDTO {
            id: group.id,
            deadline_id: group.deadline_id,
            school_class_id: group.school_class_id,
            sequence_no: group.sequence_no,
            name: group.name.clone(),
            leader_id: group.leader_id,
            leader_name,
            status,
            member_count: members.len(),
            max_members,
            reject_reason: group.reject_reason.clone(),
            submitted_rules_version: group.submitted_rules_version,
            is_lecturer_created: Some(group.is_lecturer_created),
            version: group.version,
            created_date: group.created_date,
            members,
            rule_evaluations: evals,
            all_rules_passed: all_passed,
            has_hard_rule_violations: has_hard_violations,
            group_code: GroupDTO::compute_group_code(group.sequence_no),
        })
    }

    pub async fn materialize_allocation_groups(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        actor_email: &str,
        deadline_id: i32,
        class_id: i32,
        plan: &[crate::dto::allocation::GroupView],
    ) -> Result<MaterializedAllocation, AppError> {
        let existing =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?
                .into_iter()
                .filter(|g| g.status != GroupStatus::DISBANDED.as_str())
                .collect::<Vec<_>>();

        let new_count = plan.iter().filter(|g| g.new_group).count();
        let expected_new = plan.len().saturating_sub(existing.len());

        let distinct_keys: HashSet<String> = plan.iter().map(|g| g.key()).collect();
        if new_count != expected_new || distinct_keys.len() != plan.len() {
            return Err(Self::allocation_conflict());
        }

        if new_count == 0 {
            return Ok(MaterializedAllocation {
                groups: plan.to_vec(),
                created_group_ids: HashMap::new(),
            });
        }

        let mut next_sequence = Self::compact_group_sequence(pool, class_id, deadline_id).await?;
        let mut created = HashMap::new();
        let mut resolved = Vec::new();

        for proposed in plan {
            if !proposed.new_group {
                resolved.push(proposed.clone());
                continue;
            }

            let name = proposed.name.trim();
            let key = proposed.key();
            let leader_min = proposed.members.iter().map(|m| m.student_id).min();

            let exists_name = GroupRepository::exists_by_name_and_status_not_disbanded(
                pool,
                class_id,
                deadline_id,
                name,
            )
            .await?;

            if proposed.group_id.is_some()
                || proposed.protected_group
                || proposed.status != crate::domain::GroupStatus::OPEN
                || proposed
                    .plan_group_key
                    .as_deref()
                    .map(|k| !k.starts_with("new:"))
                    .unwrap_or(true)
                || name.len() < 2
                || name.len() > 100
                || proposed.members.is_empty()
                || proposed.leader_id != leader_min
                || exists_name
            {
                return Err(Self::allocation_conflict());
            }

            next_sequence += 1;
            let group = GroupRepository::create_group(
                pool,
                deadline_id,
                class_id,
                name,
                proposed.leader_id.unwrap_or(0),
                GroupStatus::OPEN.as_str(),
                true,
                Some(next_sequence),
                Some(actor_email),
            )
            .await?;

            created.insert(key, group.id);

            GroupHistoryRepository::log_status_history(
                pool,
                group.id,
                GroupStatus::OPEN.as_str(),
                GroupStatus::OPEN.as_str(),
                actor_email,
                Some("Automatic allocation created draft group"),
            )
            .await?;

            let event = GroupRealtimeEvent {
                event_id: uuid::Uuid::new_v4().to_string(),
                event_type: "GROUP_CREATED".to_string(),
                group_id: Some(group.id),
                deadline_id: Some(deadline_id),
                school_class_id: Some(class_id),
                actor: Some(actor_email.to_string()),
                timestamp: Utc::now(),
                payload: serde_json::json!(group.id),
            };
            let _ = event_sender.send(event);

            let mut updated_view = proposed.clone();
            updated_view.group_id = Some(group.id);
            resolved.push(updated_view);
        }

        Ok(MaterializedAllocation {
            groups: resolved,
            created_group_ids: created,
        })
    }

    pub async fn apply_allocation_plan(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        plan: &[crate::dto::allocation::GroupView],
    ) -> Result<Vec<i64>, AppError> {
        let existing =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?
                .into_iter()
                .filter(|g| g.status != GroupStatus::DISBANDED.as_str())
                .collect::<Vec<_>>();

        let by_id: HashMap<i64, Group> = existing.iter().map(|g| (g.id, g.clone())).collect();
        let student_rows =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let students_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            student_rows.iter().map(|s| (s.user_id, s)).collect();

        let mut seen = HashSet::new();
        let mut kept = HashSet::new();

        let current_members = GroupMemberRepository::find_by_school_class_id_and_deadline_id(
            pool,
            class_id,
            deadline_id,
        )
        .await?;
        let current_map: HashMap<i64, crate::domain::GroupMember> = current_members
            .into_iter()
            .map(|m| (m.student_id, m))
            .collect();

        for proposed in plan {
            let gid = match proposed.group_id {
                Some(id) => id,
                None => return Err(Self::allocation_conflict()),
            };
            let group = match by_id.get(&gid) {
                Some(g) => g,
                None => return Err(Self::allocation_conflict()),
            };

            if !kept.insert(gid) {
                return Err(Self::allocation_conflict());
            }

            let group_status = match group.status.as_str() {
                "PENDING" => GroupStatus::PENDING,
                "ACCEPTED" => GroupStatus::ACCEPTED,
                "REVOKED" => GroupStatus::REVOKED,
                "DISBANDED" => GroupStatus::DISBANDED,
                _ => GroupStatus::OPEN,
            };
            if group_status != proposed.status {
                return Err(Self::allocation_conflict());
            }

            let fixed =
                group_status == GroupStatus::PENDING || group_status == GroupStatus::ACCEPTED;
            if fixed != proposed.protected_group || proposed.members.is_empty() {
                return Err(Self::allocation_conflict());
            }

            let mut leaders = 0;
            for member in &proposed.members {
                if !students_map.contains_key(&member.student_id) || !seen.insert(member.student_id)
                {
                    return Err(Self::allocation_conflict());
                }
                if member.role == GroupMemberRole::LEADER {
                    leaders += 1;
                    if Some(member.student_id) != proposed.leader_id {
                        return Err(Self::allocation_conflict());
                    }
                } else if member.role != GroupMemberRole::MEMBER {
                    return Err(Self::allocation_conflict());
                }

                let old = current_map.get(&member.student_id);
                if fixed {
                    let old_role = old.map(|o| match o.role.as_str() {
                        "LEADER" => GroupMemberRole::LEADER,
                        _ => GroupMemberRole::MEMBER,
                    });
                    if old.is_none()
                        || old.unwrap().group_id != gid
                        || old_role != Some(member.role)
                    {
                        return Err(Self::allocation_conflict());
                    }
                }
                if !fixed {
                    if let Some(old_member) = old {
                        let old_gid = old_member.group_id;
                        if let Some(old_g) = by_id.get(&old_gid) {
                            if old_g.status == "PENDING" || old_g.status == "ACCEPTED" {
                                return Err(Self::allocation_conflict());
                            }
                        }
                    }
                }
            }

            if leaders != 1 {
                return Err(Self::allocation_conflict());
            }

            if fixed {
                let member_count = GroupMemberRepository::count_by_group_id(pool, gid).await?;
                if Some(group.leader_id) != proposed.leader_id
                    || member_count as usize != proposed.members.len()
                {
                    return Err(Self::allocation_conflict());
                }
            } else {
                let class_rules =
                    GroupRuleValidationService::get_class_rules(pool, class_id).await?;
                if !GroupRuleValidationService::are_all_rules_passed(
                    &GroupRuleValidationService::evaluate_rules(&class_rules, &proposed.members),
                ) {
                    return Err(Self::allocation_conflict());
                }
            }
        }

        if seen.len() != students_map.len() {
            return Err(Self::allocation_conflict());
        }

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        for rule in &class_rules {
            if rule.status {
                if rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS
                    && (plan.len() as i32) < rule.value
                {
                    return Err(Self::allocation_conflict());
                }
                if rule.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS
                    && (plan.len() as i32) > rule.value
                {
                    return Err(Self::allocation_conflict());
                }
            }
        }

        let actor = &auth.email;

        // Apply membership assignments & leader updates
        for proposed in plan {
            if proposed.protected_group {
                continue;
            }
            let gid = proposed.group_id.unwrap();
            let group = &by_id[&gid];

            for member in &proposed.members {
                let old = current_map.get(&member.student_id);
                match old {
                    None => {
                        GroupMemberRepository::add_member(
                            pool,
                            gid,
                            member.student_id,
                            deadline_id,
                            class_id,
                            member.role.as_str(),
                        )
                        .await?;
                        GroupHistoryRepository::log_member_history(
                            pool,
                            gid,
                            member.student_id,
                            deadline_id,
                            "ASSIGNED_BY_LECTURER",
                            actor,
                            Some("Automatic allocation"),
                        )
                        .await?;
                    }
                    Some(row) if row.group_id != gid => {
                        GroupHistoryRepository::log_member_history(
                            pool,
                            row.group_id,
                            member.student_id,
                            deadline_id,
                            "REMOVED_BY_LECTURER",
                            actor,
                            Some("Automatic allocation transfer"),
                        )
                        .await?;
                        GroupHistoryRepository::log_member_history(
                            pool,
                            gid,
                            member.student_id,
                            deadline_id,
                            "ASSIGNED_BY_LECTURER",
                            actor,
                            Some("Automatic allocation transfer"),
                        )
                        .await?;

                        sqlx::query("UPDATE group_members SET group_id = ?, role = ?, joined_at = NOW() WHERE id = ?")
                            .bind(gid)
                            .bind(member.role.as_str())
                            .bind(row.id)
                            .execute(pool)
                            .await
                            .map_err(|e| AppError::Internal(format!("Failed to transfer member: {e}")))?;
                    }
                    Some(row) => {
                        if row.role != member.role.as_str() {
                            GroupMemberRepository::update_role(
                                pool,
                                gid,
                                member.student_id,
                                member.role.as_str(),
                            )
                            .await?;
                        }
                    }
                }
            }

            if Some(group.leader_id) != proposed.leader_id {
                let new_leader = proposed.leader_id.unwrap_or(0);
                GroupHistoryRepository::log_member_history(
                    pool,
                    gid,
                    new_leader,
                    deadline_id,
                    "TRANSFERRED_LEADER",
                    actor,
                    Some("Automatic allocation leader"),
                )
                .await?;
                sqlx::query("UPDATE `groups` SET leader_id = ? WHERE id = ?")
                    .bind(new_leader)
                    .bind(gid)
                    .execute(pool)
                    .await
                    .map_err(|e| AppError::Internal(format!("Failed to update leader: {e}")))?;
            }
        }

        // Disband unkept groups
        for group in &existing {
            if !kept.contains(&group.id) {
                let _ = Self::lecturer_disband_group(
                    pool,
                    event_sender,
                    auth,
                    deadline_id,
                    class_id,
                    group.id,
                )
                .await;
            }
        }

        // Submit & accept proposed draft groups
        let mut approved = Vec::new();
        for proposed in plan {
            if !proposed.protected_group {
                let gid = proposed.group_id.unwrap();
                let grp = GroupRepository::find_by_id(pool, gid)
                    .await?
                    .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;
                Self::require_complete_group(pool, &grp).await?;
                let _ = Self::lecturer_submit_group(
                    pool,
                    event_sender,
                    auth,
                    deadline_id,
                    class_id,
                    gid,
                )
                .await;
                let _ =
                    Self::accept_group(pool, event_sender, auth, deadline_id, class_id, gid).await;
                approved.push(gid);
            }
        }

        Ok(approved)
    }

    fn allocation_conflict() -> AppError {
        AppError::conflict(
            "Allocation plan no longer satisfies domain rules",
            "allocation",
            "allocationPlanConflict",
        )
    }
}

pub struct MaterializedAllocation {
    pub groups: Vec<crate::dto::allocation::GroupView>,
    pub created_group_ids: HashMap<String, i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_draft() {
        assert!(GroupService::is_draft("OPEN"));
        assert!(GroupService::is_draft("REVOKED"));
        assert!(!GroupService::is_draft("PENDING"));
        assert!(!GroupService::is_draft("ACCEPTED"));
        assert!(!GroupService::is_draft("DISBANDED"));
    }

    #[test]
    fn test_review_audit_reason() {
        let all_passed = vec![GroupRuleEvaluationDTO {
            code: GroupingRuleCode::MIN_MEMBERS_PER_GROUP,
            rule_name: "MIN_MEMBERS_PER_GROUP".to_string(),
            hard_rule: true,
            target_value: 4,
            actual_value: 5,
            passed: true,
            message: "OK".to_string(),
        }];
        assert_eq!(
            GroupService::review_audit_reason("Submitted by lecturer", &all_passed),
            "Submitted by lecturer"
        );

        let with_warnings = vec![
            GroupRuleEvaluationDTO {
                code: GroupingRuleCode::MIN_MEMBERS_PER_GROUP,
                rule_name: "MIN_MEMBERS_PER_GROUP".to_string(),
                hard_rule: true,
                target_value: 4,
                actual_value: 3,
                passed: false,
                message: "Need 4".to_string(),
            },
            GroupRuleEvaluationDTO {
                code: GroupingRuleCode::MIN_GROUPS_PER_CLASS,
                rule_name: "MIN_GROUPS_PER_CLASS".to_string(),
                hard_rule: false,
                target_value: 5,
                actual_value: 2,
                passed: false,
                message: "Need 5 groups".to_string(),
            },
        ];
        assert_eq!(
            GroupService::review_audit_reason("Giảng viên phê duyệt", &with_warnings),
            "Giảng viên phê duyệt; Rule warnings: MIN_MEMBERS_PER_GROUP, MIN_GROUPS_PER_CLASS"
        );
    }

    #[test]
    fn test_with_class_group_rules() {
        let rules = vec![
            GroupingRuleDTO {
                code: GroupingRuleCode::MIN_GROUPS_PER_CLASS,
                value: 4,
                status: true,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MAX_GROUPS_PER_CLASS,
                value: 6,
                status: true,
            },
        ];

        let composition = vec![GroupRuleEvaluationDTO {
            code: GroupingRuleCode::MIN_MEMBERS_PER_GROUP,
            rule_name: "MIN_MEMBERS_PER_GROUP".to_string(),
            hard_rule: true,
            target_value: 4,
            actual_value: 4,
            passed: true,
            message: "OK".to_string(),
        }];

        // Group count = 3: MIN_GROUPS (4) fails, MAX_GROUPS (6) passes
        let evals = GroupService::with_class_group_rules(composition, &rules, 3);
        assert_eq!(evals.len(), 3);

        let min_eval = evals
            .iter()
            .find(|e| e.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS)
            .unwrap();
        assert!(!min_eval.passed);
        assert_eq!(min_eval.actual_value, 3);
        assert!(!min_eval.hard_rule);

        let max_eval = evals
            .iter()
            .find(|e| e.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS)
            .unwrap();
        assert!(max_eval.passed);
        assert_eq!(max_eval.actual_value, 3);
        assert!(!max_eval.hard_rule);
    }
}
