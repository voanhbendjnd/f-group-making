use sqlx::MySqlPool;
use std::collections::HashMap;

use crate::domain::{GroupingRuleCode, SchoolClass};
use crate::dto::rule::{ClassRulesDTO, GroupingRuleDTO, SaveClassRulesDTO};
use crate::error::AppError;
use crate::repository::rule_repository::RuleRepository;
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::security::AuthUser;
use crate::service::school_class_service::SchoolClassService;

pub struct ClassRuleService;

impl ClassRuleService {
    pub async fn get_rules(
        pool: &MySqlPool,
        auth: &AuthUser,
        class_id: i32,
    ) -> Result<ClassRulesDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(Self::not_found)?;

        SchoolClassService::require_read_access(auth, &school_class)?;

        let stored_rules = RuleRepository::find_by_school_class_id(pool, class_id).await?;
        let by_code: HashMap<String, crate::domain::Rule> = stored_rules
            .into_iter()
            .map(|r| (r.code.clone(), r))
            .collect();

        let all_codes = GroupingRuleCode::all();
        let rules: Vec<GroupingRuleDTO> = all_codes
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

        let configured = all_codes
            .iter()
            .all(|code| by_code.contains_key(code.as_str()));

        Self::build_response(pool, &school_class, configured, rules).await
    }

    pub async fn save_rules(
        pool: &MySqlPool,
        auth: &AuthUser,
        class_id: i32,
        request: SaveClassRulesDTO,
    ) -> Result<ClassRulesDTO, AppError> {
        let school_class = SchoolClassRepository::find_by_id_for_update(pool, class_id)
            .await?
            .ok_or_else(Self::not_found)?;

        SchoolClassService::require_write_access(auth, &school_class)?;

        if request.version != school_class.rules_version {
            return Err(AppError::conflict(
                "Rules changed. Reload before saving.",
                "classRules",
                "rulesVersionConflict",
            ));
        }

        Self::validate_rules(&request.rules)?;

        let tuples: Vec<(String, i32, bool)> = request
            .rules
            .iter()
            .map(|r| (r.code.as_str().to_string(), r.value, r.status))
            .collect();

        RuleRepository::save_rules(pool, class_id, &tuples).await?;

        let new_version = school_class.rules_version + 1;
        sqlx::query(
            "UPDATE school_classes SET rules_version = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(new_version)
        .bind(class_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update rules_version: {e}")))?;

        let mut updated_class = school_class;
        updated_class.rules_version = new_version;

        let mut sorted_rules = request.rules;
        sorted_rules.sort_by_key(|r| r.code.clone());

        Self::build_response(pool, &updated_class, true, sorted_rules).await
    }

    fn validate_rules(rules: &[GroupingRuleDTO]) -> Result<(), AppError> {
        let mut values = HashMap::new();

        for rule in rules {
            if rule.value < rule.code.minimum_value() {
                return Err(Self::invalid("ruleValueOutOfRange"));
            }
            if values.insert(rule.code.clone(), rule.value).is_some() {
                return Err(Self::invalid("duplicateRuleCode"));
            }
        }

        if values.len() != GroupingRuleCode::all().len() {
            return Err(Self::invalid("incompleteRules"));
        }

        let active = Self::active_values(rules);

        let min_members = Self::bound(&active, GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 1);
        let max_members = Self::bound(&active, GroupingRuleCode::MAX_MEMBERS_PER_GROUP, i64::MAX);
        let min_groups = Self::bound(&active, GroupingRuleCode::MIN_GROUPS_PER_CLASS, 1);
        let max_groups = Self::bound(&active, GroupingRuleCode::MAX_GROUPS_PER_CLASS, i64::MAX);
        let min_majors = Self::bound(&active, GroupingRuleCode::MIN_MAJORS_PER_GROUP, 0);
        let max_majors = Self::bound(&active, GroupingRuleCode::MAX_MAJORS_PER_GROUP, i64::MAX);

        if min_members > max_members || min_groups > max_groups || min_majors > max_majors {
            return Err(Self::invalid("ruleMinGreaterThanMax"));
        }

        if min_majors > max_members {
            return Err(Self::invalid("ruleMajorsExceedMembers"));
        }

        let se_minimum = Self::bound(&active, GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 0);
        if se_minimum > 0 && se_minimum + (min_majors - 1).max(0) > max_members {
            return Err(Self::invalid("ruleSeExceedMembers"));
        }

        Ok(())
    }

    async fn build_response(
        pool: &MySqlPool,
        school_class: &SchoolClass,
        configured: bool,
        rules: Vec<GroupingRuleDTO>,
    ) -> Result<ClassRulesDTO, AppError> {
        let active = Self::active_values(&rules);
        let students = StudentRepository::count_by_school_class_id(pool, school_class.id).await?;
        let majors =
            StudentRepository::count_distinct_majors_by_school_class_id(pool, school_class.id)
                .await?;

        let mut warnings = Vec::new();
        if students == 0 {
            warnings.push("EMPTY_CLASS".to_string());
        } else {
            let se_minimum = Self::bound(&active, GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 0);
            let min_majors = Self::bound(&active, GroupingRuleCode::MIN_MAJORS_PER_GROUP, 0);
            let max_members =
                Self::bound(&active, GroupingRuleCode::MAX_MEMBERS_PER_GROUP, i64::MAX);

            let min_members_per_group =
                Self::bound(&active, GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 1);
            let required_members = min_members_per_group.max(if se_minimum > 0 {
                se_minimum + (min_majors - 1).max(0)
            } else {
                min_majors
            });

            let min_groups = Self::bound(&active, GroupingRuleCode::MIN_GROUPS_PER_CLASS, 1);
            let max_groups = Self::bound(&active, GroupingRuleCode::MAX_GROUPS_PER_CLASS, i64::MAX);

            let least_groups = min_groups.max((students - 1) / max_members + 1);
            let most_groups = max_groups.min(if required_members > 0 {
                students / required_members
            } else {
                students
            });

            if least_groups > most_groups {
                warnings.push("GROUP_COUNTS_INFEASIBLE".to_string());
            }

            if majors < min_majors {
                warnings.push("INSUFFICIENT_MAJORS".to_string());
            }

            if se_minimum > 0 {
                let se_count = StudentRepository::count_by_school_class_id_and_major_code(
                    pool,
                    school_class.id,
                    "SE",
                )
                .await?;
                if se_count < least_groups * se_minimum {
                    warnings.push("INSUFFICIENT_SE_STUDENTS".to_string());
                }
            }
        }

        Ok(ClassRulesDTO {
            school_class_id: school_class.id,
            version: school_class.rules_version,
            configured,
            rules,
            warnings,
        })
    }

    fn active_values(rules: &[GroupingRuleDTO]) -> HashMap<GroupingRuleCode, i64> {
        rules
            .iter()
            .filter(|r| r.status)
            .map(|r| (r.code.clone(), r.value as i64))
            .collect()
    }

    fn bound(
        active: &HashMap<GroupingRuleCode, i64>,
        code: GroupingRuleCode,
        fallback: i64,
    ) -> i64 {
        active.get(&code).copied().unwrap_or(fallback)
    }

    fn invalid(code: &str) -> AppError {
        AppError::bad_request("Invalid grouping rules", "classRules", code)
    }

    fn not_found() -> AppError {
        AppError::not_found("Class not found", "schoolClass", "classNotFound")
    }
}
