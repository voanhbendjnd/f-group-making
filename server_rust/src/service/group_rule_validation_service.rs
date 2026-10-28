use sqlx::MySqlPool;
use std::collections::{HashMap, HashSet};

use crate::domain::GroupingRuleCode;
use crate::dto::group::{GroupMemberDTO, GroupRuleEvaluationDTO};
use crate::dto::rule::GroupingRuleDTO;
use crate::error::AppError;
use crate::repository::rule_repository::RuleRepository;

pub struct GroupRuleValidationService;

impl GroupRuleValidationService {
    pub fn is_hard_rule(code: &GroupingRuleCode) -> bool {
        matches!(
            code,
            GroupingRuleCode::MIN_MEMBERS_PER_GROUP
                | GroupingRuleCode::MAX_MEMBERS_PER_GROUP
                | GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP
        )
    }

    pub async fn get_class_rules(
        pool: &MySqlPool,
        school_class_id: i32,
    ) -> Result<Vec<GroupingRuleDTO>, AppError> {
        let stored_rules = RuleRepository::find_by_school_class_id(pool, school_class_id).await?;
        let by_code: HashMap<String, crate::domain::Rule> = stored_rules
            .into_iter()
            .map(|r| (r.code.clone(), r))
            .collect();

        let rules = GroupingRuleCode::all()
            .iter()
            .map(|code| {
                let (val, stat) = if let Some(r) = by_code.get(code.as_str()) {
                    (r.value, r.status)
                } else {
                    (code.suggested_value(), code.is_enabled_by_default())
                };
                GroupingRuleDTO {
                    code: code.clone(),
                    value: val,
                    status: stat,
                }
            })
            .collect();

        Ok(rules)
    }

    pub fn get_min_members(rules: &[GroupingRuleDTO]) -> i32 {
        rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MIN_MEMBERS_PER_GROUP)
            .map(|r| if r.status { r.value } else { 0 })
            .unwrap_or_else(|| GroupingRuleCode::MIN_MEMBERS_PER_GROUP.suggested_value())
    }

    pub fn get_max_members(rules: &[GroupingRuleDTO]) -> i32 {
        rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MAX_MEMBERS_PER_GROUP)
            .map(|r| if r.status { r.value } else { i32::MAX })
            .unwrap_or_else(|| GroupingRuleCode::MAX_MEMBERS_PER_GROUP.suggested_value())
    }

    pub fn are_formation_rules_passed(
        rules: &[GroupingRuleDTO],
        members: &[GroupMemberDTO],
    ) -> bool {
        let evals = Self::evaluate_rules(rules, members);
        evals
            .iter()
            .filter(|e| {
                e.code == GroupingRuleCode::MAX_MEMBERS_PER_GROUP
                    || e.code == GroupingRuleCode::MAX_MAJORS_PER_GROUP
            })
            .all(|e| e.passed)
    }

    pub fn evaluate_rules(
        rules: &[GroupingRuleDTO],
        members: &[GroupMemberDTO],
    ) -> Vec<GroupRuleEvaluationDTO> {
        let by_code: HashMap<GroupingRuleCode, &GroupingRuleDTO> =
            rules.iter().map(|r| (r.code.clone(), r)).collect();

        let mut evaluations = Vec::new();
        let member_count = members.len();

        let distinct_major_ids: HashSet<i32> = members.iter().filter_map(|m| m.major_id).collect();

        let se_count = members
            .iter()
            .filter(|m| {
                m.major_code
                    .as_deref()
                    .map(|s| s.trim().eq_ignore_ascii_case("SE"))
                    .unwrap_or(false)
            })
            .count();

        for code in GroupingRuleCode::all() {
            let stored = by_code.get(code);
            let active = stored
                .map(|r| r.status)
                .unwrap_or_else(|| code.is_enabled_by_default());

            if !active {
                continue;
            }

            let target_value = stored
                .map(|r| r.value)
                .unwrap_or_else(|| code.suggested_value());
            let hard = Self::is_hard_rule(code);

            match code {
                GroupingRuleCode::MIN_MEMBERS_PER_GROUP => {
                    let passed = member_count as i32 >= target_value;
                    let message = if passed {
                        format!(
                            "Đạt số lượng thành viên tối thiểu ({}/{})",
                            member_count, target_value
                        )
                    } else {
                        format!(
                            "Cần tối thiểu {} thành viên (hiện có {})",
                            target_value, member_count
                        )
                    };
                    evaluations.push(GroupRuleEvaluationDTO {
                        code: code.clone(),
                        rule_name: code.as_str().to_string(),
                        hard_rule: hard,
                        target_value,
                        actual_value: member_count as i32,
                        passed,
                        message,
                    });
                }
                GroupingRuleCode::MAX_MEMBERS_PER_GROUP => {
                    let passed = (member_count as i32) <= target_value;
                    let message = if passed {
                        format!(
                            "Không vượt quá số lượng tối đa ({}/{})",
                            member_count, target_value
                        )
                    } else {
                        format!(
                            "Vượt quá số lượng tối đa cho phép ({}/{})",
                            member_count, target_value
                        )
                    };
                    evaluations.push(GroupRuleEvaluationDTO {
                        code: code.clone(),
                        rule_name: code.as_str().to_string(),
                        hard_rule: hard,
                        target_value,
                        actual_value: member_count as i32,
                        passed,
                        message,
                    });
                }
                GroupingRuleCode::MIN_MAJORS_PER_GROUP => {
                    let actual_majors = distinct_major_ids.len() as i32;
                    let passed = actual_majors >= target_value;
                    let message = if passed {
                        format!(
                            "Đạt số lượng chuyên ngành tối thiểu ({}/{})",
                            actual_majors, target_value
                        )
                    } else {
                        format!(
                            "Cần tối thiểu {} chuyên ngành khác nhau (hiện có {})",
                            target_value, actual_majors
                        )
                    };
                    evaluations.push(GroupRuleEvaluationDTO {
                        code: code.clone(),
                        rule_name: code.as_str().to_string(),
                        hard_rule: hard,
                        target_value,
                        actual_value: actual_majors,
                        passed,
                        message,
                    });
                }
                GroupingRuleCode::MAX_MAJORS_PER_GROUP => {
                    let actual_majors = distinct_major_ids.len() as i32;
                    let passed = actual_majors <= target_value;
                    let message = if passed {
                        format!(
                            "Không vượt quá số chuyên ngành tối đa ({}/{})",
                            actual_majors, target_value
                        )
                    } else {
                        format!(
                            "Vượt quá số chuyên ngành tối đa ({}/{})",
                            actual_majors, target_value
                        )
                    };
                    evaluations.push(GroupRuleEvaluationDTO {
                        code: code.clone(),
                        rule_name: code.as_str().to_string(),
                        hard_rule: hard,
                        target_value,
                        actual_value: actual_majors,
                        passed,
                        message,
                    });
                }
                GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP => {
                    let actual_se = se_count as i32;
                    let passed = actual_se >= target_value;
                    let message = if passed {
                        format!(
                            "Đạt số lượng sinh viên SE tối thiểu ({}/{})",
                            actual_se, target_value
                        )
                    } else {
                        format!(
                            "Cần tối thiểu {} sinh viên chuyên ngành SE (hiện có {})",
                            target_value, actual_se
                        )
                    };
                    evaluations.push(GroupRuleEvaluationDTO {
                        code: code.clone(),
                        rule_name: code.as_str().to_string(),
                        hard_rule: hard,
                        target_value,
                        actual_value: actual_se,
                        passed,
                        message,
                    });
                }
                _ => {}
            }
        }

        evaluations
    }

    pub fn are_all_rules_passed(evaluations: &[GroupRuleEvaluationDTO]) -> bool {
        evaluations.iter().all(|e| e.passed)
    }

    pub fn has_hard_rule_violations(evaluations: &[GroupRuleEvaluationDTO]) -> bool {
        evaluations.iter().any(|e| e.hard_rule && !e.passed)
    }

    pub fn get_hard_rule_violations(
        evaluations: &[GroupRuleEvaluationDTO],
    ) -> Vec<GroupRuleEvaluationDTO> {
        evaluations
            .iter()
            .filter(|e| e.hard_rule && !e.passed)
            .cloned()
            .collect()
    }

    pub fn serialize_snapshot(evaluations: &[GroupRuleEvaluationDTO]) -> String {
        serde_json::to_string(evaluations).unwrap_or_else(|_| "[]".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{GroupMemberRole, GroupingRuleCode};

    fn create_mock_member(id: i64, major_id: i32, major_code: &str) -> GroupMemberDTO {
        GroupMemberDTO {
            id,
            group_id: 1,
            student_id: id,
            roll_number: Some(format!("SE{:06}", id)),
            full_name: Some(format!("Student {}", id)),
            email: Some(format!("student{}@fpt.edu.vn", id)),
            member_code: Some(format!("HE{:06}", id)),
            cohort: Some("K18".to_string()),
            slot_type: Some("MAIN".to_string()),
            major_id: Some(major_id),
            major_code: Some(major_code.to_string()),
            major_name: Some(major_code.to_string()),
            role: if id == 1 {
                GroupMemberRole::LEADER
            } else {
                GroupMemberRole::MEMBER
            },
            joined_at: None,
            self_description: None,
            match_score: None,
            match_reasons: Vec::new(),
        }
    }

    fn create_mock_rule(code: GroupingRuleCode, value: i32, status: bool) -> GroupingRuleDTO {
        GroupingRuleDTO {
            code,
            value,
            status,
        }
    }

    #[test]
    fn test_min_max_members_defaults_and_overrides() {
        let empty_rules: Vec<GroupingRuleDTO> = Vec::new();
        assert_eq!(GroupRuleValidationService::get_min_members(&empty_rules), 4);
        assert_eq!(GroupRuleValidationService::get_max_members(&empty_rules), 6);

        let custom_rules = vec![
            create_mock_rule(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 5, true),
            create_mock_rule(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, 8, true),
        ];
        assert_eq!(
            GroupRuleValidationService::get_min_members(&custom_rules),
            5
        );
        assert_eq!(
            GroupRuleValidationService::get_max_members(&custom_rules),
            8
        );
    }

    #[test]
    fn test_formation_rules_evaluation() {
        let rules = vec![
            create_mock_rule(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 4, true),
            create_mock_rule(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, 5, true),
            create_mock_rule(GroupingRuleCode::MAX_MAJORS_PER_GROUP, 2, true),
        ];

        // 3 members with 2 majors: SE(1), SE(1), IA(2) -> formation rules passed
        let members = vec![
            create_mock_member(1, 1, "SE"),
            create_mock_member(2, 1, "SE"),
            create_mock_member(3, 2, "IA"),
        ];
        assert!(GroupRuleValidationService::are_formation_rules_passed(
            &rules, &members
        ));

        // 6 members -> exceeds max 5 -> formation rule fails!
        let members_too_many = vec![
            create_mock_member(1, 1, "SE"),
            create_mock_member(2, 1, "SE"),
            create_mock_member(3, 2, "IA"),
            create_mock_member(4, 1, "SE"),
            create_mock_member(5, 1, "SE"),
            create_mock_member(6, 1, "SE"),
        ];
        assert!(!GroupRuleValidationService::are_formation_rules_passed(
            &rules,
            &members_too_many
        ));

        // 3 members with 3 distinct majors (SE=1, IA=2, GD=3) -> exceeds max 2 majors -> formation rule fails!
        let members_too_many_majors = vec![
            create_mock_member(1, 1, "SE"),
            create_mock_member(2, 2, "IA"),
            create_mock_member(3, 3, "GD"),
        ];
        assert!(!GroupRuleValidationService::are_formation_rules_passed(
            &rules,
            &members_too_many_majors
        ));
    }

    #[test]
    fn test_min_se_rule_evaluation() {
        let rules = vec![create_mock_rule(
            GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP,
            2,
            true,
        )];

        // Only 1 SE member
        let members_one_se = vec![
            create_mock_member(1, 1, "SE"),
            create_mock_member(2, 2, "IA"),
        ];
        let evals = GroupRuleValidationService::evaluate_rules(&rules, &members_one_se);
        let se_eval = evals
            .iter()
            .find(|e| e.code == GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP)
            .unwrap();
        assert!(!se_eval.passed);
        assert_eq!(se_eval.actual_value, 1);

        // 2 SE members
        let members_two_se = vec![
            create_mock_member(1, 1, "SE"),
            create_mock_member(2, 1, "SE"),
        ];
        let evals2 = GroupRuleValidationService::evaluate_rules(&rules, &members_two_se);
        let se_eval2 = evals2
            .iter()
            .find(|e| e.code == GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP)
            .unwrap();
        assert!(se_eval2.passed);
        assert_eq!(se_eval2.actual_value, 2);
    }
}
