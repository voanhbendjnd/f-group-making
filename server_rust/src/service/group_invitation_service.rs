use chrono::Utc;
use sqlx::MySqlPool;
use std::collections::HashMap;
use tokio::sync::broadcast::Sender;

use crate::domain::{DeadlineStatus, GroupInvitationStatus, GroupMemberRole, GroupStatus};
use crate::dto::group::{
    GroupDTO, GroupInvitationDTO, GroupMemberDTO, SendInvitationRequest, StudentSearchForInviteDTO,
};
use crate::dto::realtime::GroupRealtimeEvent;
use crate::error::AppError;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::{
    GroupHistoryRepository, GroupInvitationRepository, GroupRepository,
};
use crate::repository::student_repository::StudentRepository;
use crate::security::AuthUser;
use crate::service::deadline_service::DeadlineService;
use crate::service::group_rule_validation_service::GroupRuleValidationService;
use crate::service::group_service::GroupService;

pub struct GroupInvitationService;

impl GroupInvitationService {
    pub async fn search_students_for_invite(
        pool: &MySqlPool,
        _auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        query: Option<&str>,
    ) -> Result<Vec<StudentSearchForInviteDTO>, AppError> {
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Nhóm không thuộc đợt hạn hoặc lớp học này",
                "group",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let clean_q = query.unwrap_or("").trim().to_lowercase();

        let filtered_students: Vec<&crate::dto::student::StudentDTO> = class_students
            .iter()
            .filter(|s| {
                if clean_q.is_empty() {
                    return true;
                }
                let email_match = s.email.to_lowercase().contains(&clean_q);
                let name_match = s.full_name.to_lowercase().contains(&clean_q);
                let roll_match = s.roll_number.to_lowercase().contains(&clean_q);
                let code_match = s
                    .member_code
                    .as_deref()
                    .map(|c| c.to_lowercase().contains(&clean_q))
                    .unwrap_or(false);
                email_match || name_match || roll_match || code_match
            })
            .collect();

        let all_deadline_members = GroupMemberRepository::find_by_school_class_id_and_deadline_id(
            pool,
            class_id,
            deadline_id,
        )
        .await?;
        let mut student_group_map: HashMap<i64, i64> = HashMap::new();
        for m in &all_deadline_members {
            student_group_map.insert(m.student_id, m.group_id);
        }

        let all_class_groups =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?;
        let group_name_map: HashMap<i64, String> = all_class_groups
            .into_iter()
            .map(|g| (g.id, g.name))
            .collect();

        let group_members =
            GroupMemberRepository::find_member_details_by_group_id(pool, group_id).await?;
        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);

        let pending_invitations =
            GroupInvitationRepository::find_by_group_id_and_status(pool, group_id, "PENDING")
                .await?;
        let pending_student_map: HashMap<i64, i64> = pending_invitations
            .into_iter()
            .map(|inv| (inv.student_id, inv.id))
            .collect();

        let mut results = Vec::new();

        for s in filtered_students {
            let has_group = student_group_map.contains_key(&s.user_id);
            let current_gid = student_group_map.get(&s.user_id).cloned();
            let current_gname = current_gid.and_then(|gid| group_name_map.get(&gid).cloned());

            let has_pending = pending_student_map.contains_key(&s.user_id);
            let pending_id = pending_student_map.get(&s.user_id).cloned();

            let mut can_invite = false;
            let mut violation_reason = None;

            if has_group {
                violation_reason = Some("Sinh viên này đã tham gia một nhóm khác.".to_string());
            } else if has_pending {
                violation_reason = Some(
                    "Nhóm đã gửi lời mời đến sinh viên này rồi, đang chờ phản hồi.".to_string(),
                );
            } else if (group_members.len() as i32) >= max_members {
                violation_reason = Some(format!(
                    "Nhóm đã đủ số lượng thành viên tối đa ({}).",
                    max_members
                ));
            } else {
                let mut proposed = group_members.clone();
                proposed.push(GroupMemberDTO {
                    id: 0,
                    group_id,
                    student_id: s.user_id,
                    roll_number: Some(s.roll_number.clone()),
                    full_name: Some(s.full_name.clone()),
                    email: Some(s.email.clone()),
                    member_code: s.member_code.clone(),
                    cohort: s.cohort.clone(),
                    slot_type: s.slot_type.clone(),
                    major_id: s.major_id,
                    major_code: s.major_code.clone(),
                    major_name: s.major_name.clone(),
                    role: GroupMemberRole::MEMBER,
                    joined_at: None,
                    self_description: s.self_description.clone(),
                    match_score: None,
                    match_reasons: Vec::new(),
                });

                if !GroupRuleValidationService::are_formation_rules_passed(&class_rules, &proposed)
                {
                    violation_reason = Some("Không thể mời do vi phạm quy định ghép nhóm (vượt quá giới hạn chuyên ngành)".to_string());
                } else {
                    can_invite = true;
                }
            }

            results.push(StudentSearchForInviteDTO {
                student_id: s.user_id,
                full_name: Some(s.full_name.clone()),
                email: Some(s.email.clone()),
                roll_number: Some(s.roll_number.clone()),
                member_code: s.member_code.clone(),
                major_id: s.major_id,
                major_code: s.major_code.clone(),
                major_name: s.major_name.clone(),
                self_description: s.self_description.clone(),
                has_group,
                current_group_id: current_gid,
                current_group_name: current_gname,
                can_invite,
                rule_violation_reason: violation_reason,
                has_pending_invitation: has_pending,
                pending_invitation_id: pending_id,
            });
        }

        Ok(results)
    }

    pub async fn get_my_pending_invitations(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<Vec<GroupInvitationDTO>, AppError> {
        let student_id = auth.id;
        let invitations = GroupInvitationRepository::find_by_student_id_and_deadline_id_and_status(
            pool,
            student_id,
            deadline_id,
            "PENDING",
        )
        .await?;

        if invitations.is_empty() {
            return Ok(Vec::new());
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let student_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);

        let mut results = Vec::new();
        for inv in invitations {
            let group = match GroupRepository::find_by_id(pool, inv.group_id).await? {
                Some(g) if g.status != GroupStatus::DISBANDED.as_str() => g,
                _ => continue,
            };

            let member_count =
                GroupMemberRepository::count_by_group_id(pool, group.id).await? as usize;
            let target_student = student_map.get(&student_id);
            let inviter_student = student_map.get(&inv.inviter_id);

            results.push(GroupInvitationDTO {
                id: inv.id,
                group_id: group.id,
                group_name: group.name,
                student_id,
                student_name: target_student.map(|s| s.full_name.clone()),
                student_email: target_student.map(|s| s.email.clone()),
                student_roll_number: target_student.map(|s| s.roll_number.clone()),
                student_major_code: target_student.and_then(|s| s.major_code.clone()),
                inviter_id: inv.inviter_id,
                inviter_name: inviter_student.map(|s| s.full_name.clone()),
                deadline_id,
                school_class_id: class_id,
                status: GroupInvitationStatus::PENDING,
                message: inv.message,
                created_at: inv.created_at,
                responded_at: inv.responded_at,
                current_members: member_count,
                max_members,
                match_reasons: Vec::new(),
            });
        }

        Ok(results)
    }

    pub async fn get_group_invitations(
        pool: &MySqlPool,
        _auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
    ) -> Result<Vec<GroupInvitationDTO>, AppError> {
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        let sql = "SELECT * FROM group_invitations WHERE group_id = ? AND deadline_id = ? ORDER BY id DESC";
        let invitations = sqlx::query_as::<_, crate::domain::GroupInvitation>(sql)
            .bind(group_id)
            .bind(deadline_id)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to fetch group invitations: {e}")))?;

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let student_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);
        let member_count = GroupMemberRepository::count_by_group_id(pool, group_id).await? as usize;

        let dtos = invitations
            .into_iter()
            .map(|inv| {
                let target = student_map.get(&inv.student_id);
                let inviter = student_map.get(&inv.inviter_id);
                let status = match inv.status.as_str() {
                    "ACCEPTED" => GroupInvitationStatus::ACCEPTED,
                    "REJECTED" => GroupInvitationStatus::REJECTED,
                    "CANCELLED" => GroupInvitationStatus::CANCELLED,
                    _ => GroupInvitationStatus::PENDING,
                };

                GroupInvitationDTO {
                    id: inv.id,
                    group_id,
                    group_name: group.name.clone(),
                    student_id: inv.student_id,
                    student_name: target.map(|s| s.full_name.clone()),
                    student_email: target.map(|s| s.email.clone()),
                    student_roll_number: target.map(|s| s.roll_number.clone()),
                    student_major_code: target.and_then(|s| s.major_code.clone()),
                    inviter_id: inv.inviter_id,
                    inviter_name: inviter.map(|s| s.full_name.clone()),
                    deadline_id,
                    school_class_id: class_id,
                    status,
                    message: inv.message,
                    created_at: inv.created_at,
                    responded_at: inv.responded_at,
                    current_members: member_count,
                    max_members,
                    match_reasons: Vec::new(),
                }
            })
            .collect();

        Ok(dtos)
    }

    pub async fn send_invitation(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        group_id: i64,
        request: SendInvitationRequest,
    ) -> Result<GroupInvitationDTO, AppError> {
        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    "Không tìm thấy đợt hạn",
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

        let inviter_id = auth.id;
        let group = GroupRepository::find_by_id(pool, group_id)
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
                "Nhóm hiện không ở trạng thái mở để mời thành viên.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        if GroupMemberRepository::find_by_group_id_and_student_id(pool, group_id, inviter_id)
            .await?
            .is_none()
        {
            return Err(AppError::forbidden(
                "Bạn phải là thành viên của nhóm để gửi lời mời.",
                "group",
                "ERR_FORBIDDEN_NOT_MEMBER",
            ));
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let target_student = if let Some(sid) = request.student_id {
            class_students.into_iter().find(|s| s.user_id == sid)
        } else if let Some(ref email) = request.email {
            let clean = email.trim().to_lowercase();
            class_students
                .into_iter()
                .find(|s| s.email.trim().eq_ignore_ascii_case(&clean))
        } else {
            return Err(AppError::conflict(
                "Vui lòng cung cấp ID hoặc Email của sinh viên cần mời",
                "group",
                "ERR_INVALID_INVITATION_REQUEST",
            ));
        };

        let target = target_student.ok_or_else(|| {
            AppError::not_found(
                "Sinh viên không thuộc lớp học này",
                "student",
                "studentNotFound",
            )
        })?;

        let target_student_id = target.user_id;

        if GroupMemberRepository::find_by_student_id_and_deadline_id(
            pool,
            target_student_id,
            deadline_id,
        )
        .await?
        .is_some()
        {
            return Err(AppError::conflict(
                "Sinh viên này đã tham gia một nhóm khác.",
                "group",
                "ERR_ALREADY_IN_GROUP",
            ));
        }

        if GroupInvitationRepository::exists_pending(pool, group_id, target_student_id).await? {
            return Err(AppError::conflict(
                "Nhóm đã gửi lời mời đến sinh viên này rồi, đang chờ phản hồi.",
                "group",
                "ERR_INVITATION_EXISTS",
            ));
        }

        let current_count = GroupMemberRepository::count_by_group_id(pool, group_id).await?;
        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);
        if (current_count as i32) >= max_members {
            return Err(AppError::conflict(
                format!("Nhóm đã đủ số lượng thành viên tối đa ({}).", max_members),
                "group",
                "ERR_GROUP_FULL",
            ));
        }

        let mut proposed =
            GroupMemberRepository::find_member_details_by_group_id(pool, group_id).await?;
        proposed.push(GroupMemberDTO {
            id: 0,
            group_id,
            student_id: target_student_id,
            roll_number: Some(target.roll_number.clone()),
            full_name: Some(target.full_name.clone()),
            email: Some(target.email.clone()),
            member_code: target.member_code.clone(),
            cohort: target.cohort.clone(),
            slot_type: target.slot_type.clone(),
            major_id: target.major_id,
            major_code: target.major_code.clone(),
            major_name: target.major_name.clone(),
            role: GroupMemberRole::MEMBER,
            joined_at: None,
            self_description: target.self_description.clone(),
            match_score: None,
            match_reasons: Vec::new(),
        });

        if !GroupRuleValidationService::are_formation_rules_passed(&class_rules, &proposed) {
            return Err(AppError::unprocessable(
                "Không thể mời vì vi phạm quy định ghép nhóm của lớp (vượt quá giới hạn chuyên ngành).",
                "group",
                "ERR_HARD_RULE_VIOLATED",
            ));
        }

        let inv = GroupInvitationRepository::create_invitation(
            pool,
            group_id,
            target_student_id,
            inviter_id,
            deadline_id,
            class_id,
            request.message.as_deref(),
        )
        .await?;

        let inviter_student = StudentRepository::find_students_by_school_class_id(pool, class_id)
            .await?
            .into_iter()
            .find(|s| s.user_id == inviter_id);

        let dto = GroupInvitationDTO {
            id: inv.id,
            group_id,
            group_name: group.name,
            student_id: target_student_id,
            student_name: Some(target.full_name),
            student_email: Some(target.email),
            student_roll_number: Some(target.roll_number),
            student_major_code: target.major_code,
            inviter_id,
            inviter_name: inviter_student.map(|s| s.full_name),
            deadline_id,
            school_class_id: class_id,
            status: GroupInvitationStatus::PENDING,
            message: inv.message,
            created_at: inv.created_at,
            responded_at: inv.responded_at,
            current_members: current_count as usize,
            max_members,
            match_reasons: Vec::new(),
        };

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_INVITATION_SENT".to_string(),
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

    pub async fn accept_invitation(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        invitation_id: i64,
    ) -> Result<GroupDTO, AppError> {
        let student_id = auth.id;

        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found(
                    "Không tìm thấy đợt hạn",
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

        let invitation = GroupInvitationRepository::find_by_id(pool, invitation_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Không tìm thấy lời mời", "invitation", "invitationNotFound")
            })?;

        if invitation.school_class_id != class_id || invitation.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Invalid invitation scope",
                "invitation",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if invitation.student_id != student_id {
            return Err(AppError::forbidden(
                "Bạn không phải người nhận lời mời này",
                "invitation",
                "ERR_FORBIDDEN_NOT_RECIPIENT",
            ));
        }

        if invitation.status != "PENDING" {
            return Err(AppError::conflict(
                "Lời mời này đã được phản hồi hoặc đã bị hủy.",
                "invitation",
                "ERR_INVITATION_NOT_PENDING",
            ));
        }

        let group_id = invitation.group_id;
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Không tìm thấy nhóm", "group", "groupNotFound"))?;

        if group.school_class_id != class_id || group.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Invalid invitation group scope",
                "invitation",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if group.status != GroupStatus::OPEN.as_str() {
            GroupInvitationRepository::update_status(
                pool,
                invitation_id,
                "CANCELLED",
                Some(Utc::now()),
            )
            .await?;
            return Err(AppError::conflict(
                "Nhóm hiện không ở trạng thái mở để tham gia.",
                "group",
                "ERR_GROUP_STATE_CONFLICT",
            ));
        }

        if GroupMemberRepository::find_by_student_id_and_deadline_id(pool, student_id, deadline_id)
            .await?
            .is_some()
        {
            GroupInvitationRepository::update_status(
                pool,
                invitation_id,
                "CANCELLED",
                Some(Utc::now()),
            )
            .await?;
            return Err(AppError::conflict(
                "Bạn đã tham gia một nhóm khác trong đợt này.",
                "group",
                "ERR_ALREADY_IN_GROUP",
            ));
        }

        let current_count = GroupMemberRepository::count_by_group_id(pool, group_id).await?;
        let class_rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&class_rules);
        if (current_count as i32) >= max_members {
            GroupInvitationRepository::update_status(
                pool,
                invitation_id,
                "CANCELLED",
                Some(Utc::now()),
            )
            .await?;
            return Err(AppError::conflict(
                "Nhóm đã đủ số lượng thành viên tối đa.",
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

        GroupInvitationRepository::update_status(pool, invitation_id, "ACCEPTED", Some(Utc::now()))
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
            Some("Gia nhập nhóm từ lời mời"),
        )
        .await?;

        let event1 = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_INVITATION_ACCEPTED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::json!(invitation_id),
        };
        let _ = event_sender.send(event1);

        let event2 = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "MEMBER_JOINED".to_string(),
            group_id: Some(group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::Value::Null,
        };
        let _ = event_sender.send(event2);

        GroupService::get_group_detail(pool, group_id, class_id, deadline_id).await
    }

    pub async fn reject_invitation(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        invitation_id: i64,
    ) -> Result<(), AppError> {
        let student_id = auth.id;

        let invitation = GroupInvitationRepository::find_by_id(pool, invitation_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Không tìm thấy lời mời", "invitation", "invitationNotFound")
            })?;

        if invitation.school_class_id != class_id || invitation.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Invalid invitation scope",
                "invitation",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if invitation.student_id != student_id {
            return Err(AppError::forbidden(
                "Bạn không phải người nhận lời mời này",
                "invitation",
                "ERR_FORBIDDEN_NOT_RECIPIENT",
            ));
        }

        if invitation.status != "PENDING" {
            return Err(AppError::conflict(
                "Lời mời này không ở trạng thái chờ phản hồi.",
                "invitation",
                "ERR_INVITATION_NOT_PENDING",
            ));
        }

        GroupInvitationRepository::update_status(pool, invitation_id, "REJECTED", Some(Utc::now()))
            .await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_INVITATION_REJECTED".to_string(),
            group_id: Some(invitation.group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::json!(invitation_id),
        };
        let _ = event_sender.send(event);

        Ok(())
    }

    pub async fn cancel_invitation(
        pool: &MySqlPool,
        event_sender: &Sender<GroupRealtimeEvent>,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
        invitation_id: i64,
    ) -> Result<(), AppError> {
        let current_user_id = auth.id;

        let invitation = GroupInvitationRepository::find_by_id(pool, invitation_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Không tìm thấy lời mời", "invitation", "invitationNotFound")
            })?;

        if invitation.school_class_id != class_id || invitation.deadline_id != deadline_id {
            return Err(AppError::forbidden(
                "Invalid invitation scope",
                "invitation",
                "ERR_FORBIDDEN_NOT_IN_CLASS",
            ));
        }

        if GroupMemberRepository::find_by_group_id_and_student_id(
            pool,
            invitation.group_id,
            current_user_id,
        )
        .await?
        .is_none()
        {
            return Err(AppError::forbidden(
                "Bạn không có quyền hủy lời mời của nhóm này",
                "invitation",
                "ERR_FORBIDDEN_NOT_MEMBER",
            ));
        }

        if invitation.status != "PENDING" {
            return Err(AppError::conflict(
                "Chỉ có thể hủy lời mời đang ở trạng thái chờ phản hồi.",
                "invitation",
                "ERR_INVITATION_NOT_PENDING",
            ));
        }

        GroupInvitationRepository::update_status(
            pool,
            invitation_id,
            "CANCELLED",
            Some(Utc::now()),
        )
        .await?;

        let event = GroupRealtimeEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: "GROUP_INVITATION_CANCELLED".to_string(),
            group_id: Some(invitation.group_id),
            deadline_id: Some(deadline_id),
            school_class_id: Some(class_id),
            actor: Some(auth.email.clone()),
            timestamp: Utc::now(),
            payload: serde_json::json!(invitation_id),
        };
        let _ = event_sender.send(event);

        Ok(())
    }

    pub async fn cancel_for_allocation(
        pool: &MySqlPool,
        deadline_id: i32,
        class_id: i32,
        affected_groups: &std::collections::HashSet<i64>,
        actor_email: &str,
        event_sender: &tokio::sync::broadcast::Sender<crate::dto::realtime::GroupRealtimeEvent>,
    ) -> Result<Vec<i64>, AppError> {
        let invitations =
            GroupInvitationRepository::find_by_school_class_id_and_deadline_id_and_status(
                pool,
                class_id,
                deadline_id,
                "PENDING",
            )
            .await?;

        let mut cancelled = Vec::new();
        for inv in invitations {
            if affected_groups.contains(&inv.group_id) {
                GroupInvitationRepository::update_status(
                    pool,
                    inv.id,
                    "CANCELLED",
                    Some(Utc::now()),
                )
                .await?;
                let event = crate::dto::realtime::GroupRealtimeEvent {
                    event_id: uuid::Uuid::new_v4().to_string(),
                    event_type: "GROUP_INVITATION_CANCELLED".to_string(),
                    group_id: Some(inv.group_id),
                    deadline_id: Some(deadline_id),
                    school_class_id: Some(class_id),
                    actor: Some(actor_email.to_string()),
                    timestamp: Utc::now(),
                    payload: serde_json::json!(inv.id),
                };
                let _ = event_sender.send(event);
                cancelled.push(inv.id);
            }
        }

        cancelled.sort();
        Ok(cancelled)
    }
}
