use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

use crate::domain::{GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::group::{GroupMemberDTO, GroupRecommendationDTO};
use crate::error::AppError;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::GroupRepository;
use crate::repository::student_repository::StudentRepository;
use crate::service::group_rule_validation_service::GroupRuleValidationService;

pub struct GroupRecommendationService;

impl GroupRecommendationService {
    pub async fn recommend_students_for_group(
        pool: &MySqlPool,
        group_id: i64,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<GroupMemberDTO>, AppError> {
        let group = GroupRepository::find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| AppError::not_found("Group not found", "group", "groupNotFound"))?;

        if group.status == GroupStatus::DISBANDED.as_str() {
            return Ok(Vec::new());
        }

        let rules = GroupRuleValidationService::get_class_rules(pool, school_class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&rules);

        let min_members = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_MEMBERS_PER_GROUP)
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_MEMBERS_PER_GROUP.suggested_value());

        let min_se_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP);
        let min_se_active = min_se_rule.map(|r| r.status).unwrap_or(false);
        let min_se = min_se_rule
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP.suggested_value());

        let min_majors_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_MAJORS_PER_GROUP);
        let min_majors_active = min_majors_rule.map(|r| r.status).unwrap_or(false);
        let min_majors = min_majors_rule
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_MAJORS_PER_GROUP.suggested_value());

        let max_majors_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MAX_MAJORS_PER_GROUP);
        let max_majors_active = max_majors_rule.map(|r| r.status).unwrap_or(false);
        let max_majors = max_majors_rule.map(|r| r.value).unwrap_or(i32::MAX);

        let group_members = GroupMemberRepository::find_by_group_id(pool, group_id).await?;
        if (group_members.len() as i32) >= max_members {
            return Ok(Vec::new());
        }

        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, school_class_id).await?;
        let class_student_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let assigned_ids =
            GroupMemberRepository::find_assigned_student_ids(pool, school_class_id, deadline_id)
                .await?;
        let assigned_set: HashSet<i64> = assigned_ids.into_iter().collect();

        let unassigned_students: Vec<&crate::dto::student::StudentDTO> = class_students
            .iter()
            .filter(|s| !assigned_set.contains(&s.user_id))
            .collect();

        let current_major_ids: HashSet<i32> = group_members
            .iter()
            .filter_map(|gm| class_student_map.get(&gm.student_id))
            .filter_map(|s| s.major_id)
            .collect();

        let current_se_count = group_members
            .iter()
            .filter_map(|gm| class_student_map.get(&gm.student_id))
            .filter(|s| {
                s.major_code
                    .as_deref()
                    .map(|c| c.trim().eq_ignore_ascii_case("SE"))
                    .unwrap_or(false)
            })
            .count() as i32;

        let mut recommendations = Vec::new();

        for s in unassigned_students {
            let is_new_major = s
                .major_id
                .map(|mid| !current_major_ids.contains(&mid))
                .unwrap_or(false);
            if max_majors_active
                && is_new_major
                && ((current_major_ids.len() as i32) + 1 > max_majors)
            {
                continue;
            }

            let mut score = 50;
            let mut reasons = Vec::new();

            let is_se = s
                .major_code
                .as_deref()
                .map(|c| c.trim().eq_ignore_ascii_case("SE"))
                .unwrap_or(false);

            if min_se_active && current_se_count < min_se && is_se {
                score += 40;
                reasons.push("Khắc phục điều kiện tiên quyết: Bổ sung sinh viên ngành Kỹ thuật Phần mềm (SE)".to_string());
            }

            if min_majors_active && (current_major_ids.len() as i32) < min_majors && is_new_major {
                score += 25;
                reasons.push(format!(
                    "Gia tăng sự đa dạng ngành: Bổ sung chuyên ngành mới ({})",
                    s.major_code.as_deref().unwrap_or("")
                ));
            }

            if (group_members.len() as i32) < min_members {
                score += 15;
                reasons.push(format!(
                    "Giúp nhóm đạt sĩ số tối thiểu ({}/{})",
                    group_members.len() + 1,
                    min_members
                ));
            }

            if s.self_description
                .as_ref()
                .map(|d| !d.trim().is_empty())
                .unwrap_or(false)
            {
                score += 10;
                reasons.push("Đã cập nhật mô tả năng lực bản thân".to_string());
            }

            score = score.clamp(10, 100);

            let dto = GroupMemberDTO {
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
                match_score: Some(score),
                match_reasons: reasons,
            };

            recommendations.push(dto);
        }

        recommendations.sort_by(|a, b| {
            b.match_score
                .cmp(&a.match_score)
                .then_with(|| a.full_name.cmp(&b.full_name))
        });

        Ok(recommendations)
    }

    pub async fn recommend_groups_for_student(
        pool: &MySqlPool,
        student_id: i64,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<GroupRecommendationDTO>, AppError> {
        let class_students =
            StudentRepository::find_students_by_school_class_id(pool, school_class_id).await?;
        let student = class_students
            .iter()
            .find(|s| s.user_id == student_id)
            .ok_or_else(|| {
                AppError::not_found("Student not found", "student", "studentNotFound")
            })?;

        let class_groups = GroupRepository::find_by_school_class_id_and_deadline_id(
            pool,
            school_class_id,
            deadline_id,
        )
        .await?;
        let rules = GroupRuleValidationService::get_class_rules(pool, school_class_id).await?;
        let max_members = GroupRuleValidationService::get_max_members(&rules);

        let min_members = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_MEMBERS_PER_GROUP)
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_MEMBERS_PER_GROUP.suggested_value());

        let min_se_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP);
        let min_se_active = min_se_rule.map(|r| r.status).unwrap_or(false);
        let min_se = min_se_rule
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP.suggested_value());

        let min_majors_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_MAJORS_PER_GROUP);
        let min_majors_active = min_majors_rule.map(|r| r.status).unwrap_or(false);
        let min_majors = min_majors_rule
            .map(|r| r.value)
            .unwrap_or_else(|| GroupingRuleCode::MIN_MAJORS_PER_GROUP.suggested_value());

        let max_majors_rule = rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MAX_MAJORS_PER_GROUP);
        let max_majors_active = max_majors_rule.map(|r| r.status).unwrap_or(false);
        let max_majors = max_majors_rule.map(|r| r.value).unwrap_or(i32::MAX);

        let class_student_map: HashMap<i64, &crate::dto::student::StudentDTO> =
            class_students.iter().map(|s| (s.user_id, s)).collect();

        let all_members = GroupMemberRepository::find_by_school_class_id_and_deadline_id(
            pool,
            school_class_id,
            deadline_id,
        )
        .await?;
        let mut members_by_group: HashMap<i64, Vec<&crate::domain::GroupMember>> = HashMap::new();
        for m in &all_members {
            members_by_group.entry(m.group_id).or_default().push(m);
        }

        let student_is_se = student
            .major_code
            .as_deref()
            .map(|c| c.trim().eq_ignore_ascii_case("SE"))
            .unwrap_or(false);

        let mut recommendations = Vec::new();

        for group in class_groups {
            if group.status != GroupStatus::OPEN.as_str() {
                continue;
            }

            let members = members_by_group.get(&group.id).cloned().unwrap_or_default();
            if (members.len() as i32) >= max_members {
                continue;
            }

            let current_major_ids: HashSet<i32> = members
                .iter()
                .filter_map(|gm| class_student_map.get(&gm.student_id))
                .filter_map(|s| s.major_id)
                .collect();

            let se_count = members
                .iter()
                .filter_map(|gm| class_student_map.get(&gm.student_id))
                .filter(|s| {
                    s.major_code
                        .as_deref()
                        .map(|c| c.trim().eq_ignore_ascii_case("SE"))
                        .unwrap_or(false)
                })
                .count() as i32;

            let is_new_major = student
                .major_id
                .map(|mid| !current_major_ids.contains(&mid))
                .unwrap_or(false);
            if max_majors_active
                && is_new_major
                && ((current_major_ids.len() as i32) + 1 > max_majors)
            {
                continue;
            }

            let mut score = 50;
            let mut reasons = Vec::new();

            if min_se_active && se_count < min_se && student_is_se {
                score += 40;
                reasons.push(
                    "Nhóm đang rất cần sinh viên chuyên ngành Kỹ thuật Phần mềm (SE) của bạn!"
                        .to_string(),
                );
            }

            if min_majors_active && (current_major_ids.len() as i32) < min_majors && is_new_major {
                score += 25;
                reasons.push(format!(
                    "Chuyên ngành {} của bạn giúp nhóm hoàn thiện tiêu chí đa ngành",
                    student.major_code.as_deref().unwrap_or("")
                ));
            }

            if (members.len() as i32) < min_members {
                score += 15;
                reasons.push(format!(
                    "Nhóm đang cần thêm thành viên để đủ điều kiện nộp duyệt ({}/{})",
                    members.len() + 1,
                    min_members
                ));
            }

            score = score.clamp(10, 100);

            recommendations.push(GroupRecommendationDTO {
                group_id: group.id,
                group_name: group.name,
                current_members: members.len(),
                max_members,
                match_score: score,
                match_reasons: reasons,
                is_eligible: true,
            });
        }

        recommendations.sort_by(|a, b| {
            b.match_score
                .cmp(&a.match_score)
                .then_with(|| a.group_name.cmp(&b.group_name))
        });

        Ok(recommendations)
    }
}
