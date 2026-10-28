use std::collections::BTreeMap;

use crate::domain::GroupingRuleCode;
use crate::dto::allocation::{CriterionScore, GroupScoreDTO, RuleScore, ScoreCriterion};
use crate::dto::group::{GroupMemberDTO, GroupRuleEvaluationDTO};
use crate::dto::rule::GroupingRuleDTO;
use crate::service::group_rule_validation_service::GroupRuleValidationService;

pub struct GroupScoreService;

impl GroupScoreService {
    pub fn evaluate_rules(rules: &[GroupingRuleDTO], members: &[GroupMemberDTO]) -> GroupScoreDTO {
        let evaluations = GroupRuleValidationService::evaluate_rules(rules, members);
        Self::score(members, &evaluations)
    }

    pub fn score(
        members: &[GroupMemberDTO],
        evaluations: &[GroupRuleEvaluationDTO],
    ) -> GroupScoreDTO {
        let mut grouped: BTreeMap<ScoreCriterion, Vec<&GroupRuleEvaluationDTO>> = BTreeMap::new();
        for evaluation in evaluations {
            if let Some(criterion) = Self::criterion(&evaluation.code) {
                grouped.entry(criterion).or_default().push(evaluation);
            }
        }

        let passed = evaluations.iter().all(|e| e.passed);
        if grouped.is_empty() {
            return GroupScoreDTO {
                score_percent: None,
                applicable: false,
                composition_rules_passed: passed,
                breakdown: vec![],
            };
        }

        let total_weight: i32 = grouped.keys().map(|k| Self::weight(*k)).sum();
        let mut breakdown = Vec::new();
        let mut total = 0.0;

        for (criterion, rules) in grouped {
            let mut fulfillment = rules
                .iter()
                .map(|r| Self::fulfillment(r))
                .fold(f64::INFINITY, f64::min);
            if fulfillment.is_infinite() {
                fulfillment = 1.0;
            }

            if members.is_empty() {
                fulfillment = 0.0;
            }

            let effective_weight = 100.0 * (Self::weight(criterion) as f64) / (total_weight as f64);
            let contribution = effective_weight * fulfillment;
            total += contribution;

            let rule_scores = rules
                .into_iter()
                .map(|rule| RuleScore {
                    code: rule.code.clone(),
                    actual_value: rule.actual_value,
                    target_value: rule.target_value,
                    passed: rule.passed,
                    fulfillment_percent: Self::round(100.0 * Self::fulfillment(rule)),
                })
                .collect();

            breakdown.push(CriterionScore {
                code: criterion,
                base_weight: Self::weight(criterion),
                effective_weight_percent: Self::round(effective_weight),
                fulfillment_percent: Self::round(100.0 * fulfillment),
                contribution_percent: Self::round(contribution),
                rules: rule_scores,
            });
        }

        GroupScoreDTO {
            score_percent: Some(Self::round(total)),
            applicable: true,
            composition_rules_passed: passed,
            breakdown,
        }
    }

    fn criterion(code: &GroupingRuleCode) -> Option<ScoreCriterion> {
        match code {
            GroupingRuleCode::MIN_MEMBERS_PER_GROUP | GroupingRuleCode::MAX_MEMBERS_PER_GROUP => {
                Some(ScoreCriterion::Members)
            }
            GroupingRuleCode::MIN_MAJORS_PER_GROUP | GroupingRuleCode::MAX_MAJORS_PER_GROUP => {
                Some(ScoreCriterion::Majors)
            }
            GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP => Some(ScoreCriterion::Se),
            _ => None,
        }
    }

    fn weight(criterion: ScoreCriterion) -> i32 {
        match criterion {
            ScoreCriterion::Members => 40,
            ScoreCriterion::Majors => 35,
            ScoreCriterion::Se => 25,
        }
    }

    fn fulfillment(rule: &GroupRuleEvaluationDTO) -> f64 {
        let actual = rule.actual_value;
        let target = rule.target_value;
        match rule.code {
            GroupingRuleCode::MAX_MEMBERS_PER_GROUP | GroupingRuleCode::MAX_MAJORS_PER_GROUP => {
                if actual <= target || actual == 0 {
                    1.0
                } else {
                    target as f64 / actual as f64
                }
            }
            _ => {
                if target == 0 {
                    1.0
                } else {
                    (actual as f64 / target as f64).min(1.0)
                }
            }
        }
    }

    fn round(value: f64) -> f64 {
        (value * 10.0).round() / 10.0
    }
}
