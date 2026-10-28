use sqlx::MySqlPool;
use std::collections::{BTreeMap, HashMap, HashSet};

use crate::domain::{GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::allocation::*;
use crate::dto::group::{GroupDTO, GroupMemberDTO};
use crate::error::AppError;
use crate::repository::allocation_repository::AllocationPreviewRepository;
use crate::security::AuthUser;
use crate::service::allocation_balance_policy::AllocationBalancePolicy;
use crate::service::allocation_plan_history_service::AllocationPlanHistoryService;
use crate::service::allocation_preview_service::{AllocationPreviewService, Captured};
use crate::service::group_rule_validation_service::GroupRuleValidationService;
use crate::service::group_score_service::GroupScoreService;
use crate::service::smart_allocation_service::SmartAllocationService;

pub struct AllocationRecommendationService;

#[derive(Debug, Clone, PartialEq, Eq)]
struct SizePreference {
    squared_shortfall: u128,
    groups: usize,
}

impl PartialOrd for SizePreference {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SizePreference {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        let left = self.squared_shortfall * (other.groups as u128);
        let right = other.squared_shortfall * (self.groups as u128);
        left.cmp(&right)
    }
}

#[derive(Debug, Clone)]
struct Candidate {
    id: String,
    fingerprint: String,
    metrics: AllocationRecommendationMetrics,
    search_complete: bool,
    size_preference: Option<SizePreference>,
}

impl AllocationRecommendationService {
    pub async fn recommend(
        pool: &MySqlPool,
        auth: &AuthUser,
        deadline_id: i32,
        class_id: i32,
    ) -> Result<AllocationRecommendationDTO, AppError> {
        let captured = AllocationPreviewService::capture_for_history(
            pool,
            auth.id,
            &auth.authorities,
            deadline_id,
            class_id,
        )
        .await?;

        if captured.is_none() {
            return Ok(Self::empty(None));
        }

        let current = captured.unwrap();
        let fingerprint = current.overview.snapshot_fingerprint.clone();

        if AllocationPreviewService::is_allocation_complete(&current.overview)
            || current.overview.scope.deadline_status == "CANCELLED"
        {
            return Ok(Self::empty(Some(fingerprint)));
        }

        let owner = auth.id;
        let max_members = current
            .snapshot
            .rules
            .iter()
            .find(|r| r.code == GroupingRuleCode::MAX_MEMBERS_PER_GROUP && r.status && r.value > 0)
            .map(|r| r.value);

        let mut best: Option<Candidate> = None;
        let mut eligible = 0;
        let mut equivalent = 0;
        let mut page = 0;
        let page_size = 50;

        loop {
            let offset = page * page_size;
            let batch = AllocationPreviewRepository::find_eligible_for_recommendation(
                pool,
                class_id,
                deadline_id,
                owner,
                &fingerprint,
                offset,
                page_size,
            )
            .await?;

            let batch_len = batch.len();
            for row in batch {
                if row.applied_at.is_some()
                    || row.owner_id != owner
                    || row.school_class_id != class_id
                    || row.deadline_id != deadline_id
                    || row.snapshot_fingerprint != fingerprint
                {
                    continue;
                }

                let saved = match AllocationPlanHistoryService::decode(&row) {
                    Some(s) => s,
                    None => continue,
                };

                if saved.result.target_group_count != row.target_count {
                    continue;
                }

                let metrics = match Self::evaluate(&current, &saved) {
                    Some(m) => m,
                    None => continue,
                };

                eligible += 1;
                let candidate = Candidate {
                    id: row.id,
                    fingerprint: row.plan_fingerprint,
                    metrics,
                    search_complete: saved.result.search_complete,
                    size_preference: Self::size_preference(max_members, &saved.groups),
                };

                let comparison = match &best {
                    None => -1,
                    Some(b) => Self::compare_quality(&candidate, b),
                };

                if comparison < 0 {
                    best = Some(candidate);
                    equivalent = 1;
                } else if comparison == 0 {
                    equivalent += 1;
                    if let Some(ref current_best) = best {
                        let ord = candidate
                            .fingerprint
                            .cmp(&current_best.fingerprint)
                            .then_with(|| candidate.id.cmp(&current_best.id));
                        if ord == std::cmp::Ordering::Less {
                            best = Some(candidate);
                        }
                    }
                }
            }

            if (batch_len as i64) < page_size {
                break;
            }
            page += 1;
        }

        match best {
            None => Ok(Self::empty(Some(fingerprint))),
            Some(b) => {
                let groups = b.metrics.groups;
                let reasons = Self::reasons(&b, equivalent);
                Ok(AllocationRecommendationDTO {
                    snapshot_fingerprint: Some(fingerprint),
                    plan_id: Some(b.id),
                    target_group_count: Some(groups),
                    eligible_plans: eligible,
                    equivalent_plans: equivalent,
                    metrics: Some(b.metrics),
                    reasons,
                })
            }
        }
    }

    fn size_preference(max_members: Option<i32>, groups: &[GroupView]) -> Option<SizePreference> {
        let max = max_members?;
        let editable: Vec<&GroupView> = groups.iter().filter(|g| !g.protected_group).collect();
        let mut sum: u128 = 0;
        for g in &editable {
            let diff = (max - g.members.len() as i32).max(0) as u128;
            sum += diff * diff;
        }
        Some(SizePreference {
            squared_shortfall: sum,
            groups: 1.max(editable.len()),
        })
    }

    fn empty(fingerprint: Option<String>) -> AllocationRecommendationDTO {
        AllocationRecommendationDTO {
            snapshot_fingerprint: fingerprint,
            plan_id: None,
            target_group_count: None,
            eligible_plans: 0,
            equivalent_plans: 0,
            metrics: None,
            reasons: vec![],
        }
    }

    fn evaluate(
        current: &Captured,
        saved: &AllocationPreviewDTO,
    ) -> Option<AllocationRecommendationMetrics> {
        let snapshot = &current.snapshot;
        let plan = &saved.groups;
        let target = plan.len() as i32;
        if target == 0 {
            return None;
        }

        let sizes: Vec<i32> = plan.iter().map(|g| g.members.len() as i32).collect();
        if !AllocationBalancePolicy::is_balanced(&sizes) {
            return None;
        }

        for rule in &snapshot.rules {
            if rule.status {
                if rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS && target < rule.value {
                    return None;
                }
                if rule.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS && target > rule.value {
                    return None;
                }
            }
        }

        let students_map: HashMap<i64, &GroupMemberDTO> = snapshot
            .students
            .iter()
            .map(|s| (s.student_id, s))
            .collect();

        let original: HashMap<i64, &GroupDTO> = snapshot
            .groups
            .iter()
            .filter(|g| g.status != GroupStatus::DISBANDED)
            .map(|g| (g.id, g))
            .collect();

        let mut origins: HashMap<i64, &GroupDTO> = HashMap::new();
        for g in original.values() {
            for m in &g.members {
                origins.insert(m.student_id, g);
            }
        }

        let mut seen = HashSet::new();
        let mut kept = HashSet::new();
        let mut names = HashSet::new();

        let mut pairs: i64 = 0;
        let mut preserved = 0;
        let mut leaders = 0;
        let mut moves = 0;
        let mut three = 0;
        let mut four = 0;
        let mut unknown = 0;
        let mut score_sum = 0.0;
        let mut scored = 0;
        let mut protected_count = 0;

        let valid_before = original
            .values()
            .filter(|g| Self::is_draft(g.status))
            .filter(|g| {
                GroupRuleValidationService::are_all_rules_passed(
                    &GroupRuleValidationService::evaluate_rules(&snapshot.rules, &g.members),
                )
            })
            .count() as i32;

        for group in plan {
            let old = group.group_id.and_then(|id| original.get(&id).copied());
            let fixed = old.is_some() && !Self::is_draft(old.unwrap().status);

            if let Some(o) = old {
                if !kept.insert(o.id) || group.new_group || o.status != group.status {
                    return None;
                }
            }

            if fixed != group.protected_group {
                return None;
            }

            if old.is_none()
                && (!group.new_group
                    || group.group_id.is_some()
                    || group.status != GroupStatus::OPEN
                    || group
                        .plan_group_key
                        .as_deref()
                        .map(|k| !k.starts_with("new:"))
                        .unwrap_or(true))
            {
                return None;
            }

            let name = group.name.trim();
            if !names.insert(name.to_lowercase()) {
                return None;
            }

            if group.new_group {
                if name.len() < 2 || name.len() > 100 {
                    return None;
                }
                if original.values().any(|g| g.name.eq_ignore_ascii_case(name)) {
                    return None;
                }
            }

            let mut member_ids = HashSet::new();
            let mut canonical = Vec::new();
            let mut leader_count = 0;

            for member in &group.members {
                let actual = match students_map.get(&member.student_id) {
                    Some(a) => *a,
                    None => return None,
                };
                if !seen.insert(actual.student_id) {
                    return None;
                }
                member_ids.insert(actual.student_id);
                canonical.push(actual.clone());

                if member.role == GroupMemberRole::LEADER {
                    if Some(member.student_id) != group.leader_id {
                        return None;
                    }
                    leader_count += 1;
                } else if member.role != GroupMemberRole::MEMBER {
                    return None;
                }

                if let Some(from) = origins.get(&actual.student_id) {
                    if Some(from.id) != group.group_id {
                        moves += 1;
                    }
                }
            }

            if leader_count != 1
                || !group
                    .leader_id
                    .map(|lid| member_ids.contains(&lid))
                    .unwrap_or(false)
            {
                return None;
            }

            if group.new_group {
                let min_id = member_ids.iter().copied().min();
                if group.leader_id != min_id {
                    return None;
                }
            }

            if fixed {
                protected_count += 1;
                let old_g = old.unwrap();
                let old_ids: HashSet<i64> = old_g.members.iter().map(|m| m.student_id).collect();
                if Some(old_g.leader_id) != group.leader_id || old_ids != member_ids {
                    return None;
                }
                let old_roles: HashMap<i64, GroupMemberRole> = old_g
                    .members
                    .iter()
                    .map(|m| (m.student_id, m.role))
                    .collect();
                if group
                    .members
                    .iter()
                    .any(|m| old_roles.get(&m.student_id) != Some(&m.role))
                {
                    return None;
                }
            }

            if !GroupRuleValidationService::are_all_rules_passed(
                &GroupRuleValidationService::evaluate_rules(&snapshot.rules, &canonical),
            ) {
                return None;
            }

            if let Some(o) = old {
                if Self::is_draft(o.status) {
                    let old_ids: HashSet<i64> = o.members.iter().map(|m| m.student_id).collect();
                    if old_ids == member_ids
                        && GroupRuleValidationService::are_all_rules_passed(
                            &GroupRuleValidationService::evaluate_rules(
                                &snapshot.rules,
                                &o.members,
                            ),
                        )
                    {
                        preserved += 1;
                    }
                }
                if Some(o.leader_id) == group.leader_id {
                    leaders += 1;
                }
            }

            pairs += SmartAllocationService::major_concentration(&canonical);

            let mut major_counts: HashMap<i32, usize> = HashMap::new();
            for m in &canonical {
                if let Some(id) = m.major_id {
                    *major_counts.entry(id).or_insert(0) += 1;
                }
            }
            if major_counts.values().any(|&n| n >= 3) {
                three += 1;
            }
            if major_counts.values().any(|&n| n >= 4) {
                four += 1;
            }
            unknown += canonical.iter().filter(|m| m.major_id.is_none()).count() as i32;

            let score = GroupScoreService::evaluate_rules(&snapshot.rules, &canonical);
            if score.applicable {
                if let Some(percent) = score.score_percent {
                    score_sum += percent;
                    scored += 1;
                }
            }
        }

        if seen.len() != students_map.len() {
            return None;
        }
        if original
            .values()
            .any(|g| !Self::is_draft(g.status) && !kept.contains(&g.id))
        {
            return None;
        }

        let new_group_count = plan.iter().filter(|g| g.new_group).count();
        if new_group_count != (target as usize).saturating_sub(original.len()) {
            return None;
        }

        let mut major_totals: HashMap<i32, i64> = HashMap::new();
        for s in students_map.values() {
            if let Some(id) = s.major_id {
                *major_totals.entry(id).or_insert(0) += 1;
            }
        }

        let lower: i64 = major_totals
            .values()
            .map(|&n| {
                let q = n / (target as i64);
                let r = n % (target as i64);
                (target as i64) * q * (q - 1) / 2 + r * q
            })
            .sum();

        let mut size_map: BTreeMap<i32, i32> = BTreeMap::new();
        for g in plan {
            *size_map.entry(g.members.len() as i32).or_insert(0) += 1;
        }

        let distribution: Vec<SizeCount> = size_map
            .into_iter()
            .map(|(members, groups)| SizeCount { members, groups })
            .collect();

        let size_difference = if distribution.len() > 1 {
            distribution.last().unwrap().members - distribution.first().unwrap().members
        } else {
            0
        };

        let avg_score = if scored == 0 {
            None
        } else {
            Some(((score_sum / scored as f64) * 10.0).round() / 10.0)
        };

        Some(AllocationRecommendationMetrics {
            students: seen.len() as i32,
            groups: target,
            size_distribution: distribution,
            size_difference,
            same_major_pairs: pairs,
            even_distribution_lower_bound: lower,
            excess_major_pairs: pairs - lower,
            groups_with_three_plus_same_major: three,
            groups_with_four_plus_same_major: four,
            unknown_major_students: unknown,
            valid_drafts_preserved: preserved,
            valid_drafts_before: valid_before,
            leaders_preserved: leaders,
            leaders_before: original.len() as i32,
            moved_students: moves,
            unassigned_allocated: students_map.len() as i32 - origins.len() as i32,
            protected_groups: protected_count,
            average_group_score: avg_score,
        })
    }

    fn is_draft(status: GroupStatus) -> bool {
        status == GroupStatus::OPEN || status == GroupStatus::REVOKED
    }

    fn compare_quality(first: &Candidate, second: &Candidate) -> i32 {
        let a = &first.metrics;
        let b = &second.metrics;

        let cmp = a.excess_major_pairs.cmp(&b.excess_major_pairs);
        if cmp != std::cmp::Ordering::Equal {
            return if cmp == std::cmp::Ordering::Less {
                -1
            } else {
                1
            };
        }

        let cmp = b.valid_drafts_preserved.cmp(&a.valid_drafts_preserved);
        if cmp != std::cmp::Ordering::Equal {
            return if cmp == std::cmp::Ordering::Less {
                -1
            } else {
                1
            };
        }

        let cmp = b.leaders_preserved.cmp(&a.leaders_preserved);
        if cmp != std::cmp::Ordering::Equal {
            return if cmp == std::cmp::Ordering::Less {
                -1
            } else {
                1
            };
        }

        let cmp = a.moved_students.cmp(&b.moved_students);
        if cmp != std::cmp::Ordering::Equal {
            return if cmp == std::cmp::Ordering::Less {
                -1
            } else {
                1
            };
        }

        if let (Some(pref_a), Some(pref_b)) = (&first.size_preference, &second.size_preference) {
            let cmp = pref_a.cmp(pref_b);
            if cmp != std::cmp::Ordering::Equal {
                return if cmp == std::cmp::Ordering::Less {
                    -1
                } else {
                    1
                };
            }

            let cmp = b.groups.cmp(&a.groups);
            if cmp != std::cmp::Ordering::Equal {
                return if cmp == std::cmp::Ordering::Less {
                    -1
                } else {
                    1
                };
            }
        }

        0
    }

    fn reasons(selected: &Candidate, equivalent: i32) -> Vec<AllocationRecommendationReason> {
        let m = &selected.metrics;
        let mut reasons = Vec::new();

        let mut p = HashMap::new();
        p.insert("groups".to_string(), serde_json::json!(m.groups));
        reasons.push(AllocationRecommendationReason::new(
            AllocationRecommendationReasonCode::AllRulesPassed,
            p,
        ));

        let mut p = HashMap::new();
        p.insert(
            "difference".to_string(),
            serde_json::json!(m.size_difference),
        );
        reasons.push(AllocationRecommendationReason::new(
            AllocationRecommendationReasonCode::BalancedSizes,
            p,
        ));

        let mut p = HashMap::new();
        p.insert(
            "excess".to_string(),
            serde_json::json!(m.excess_major_pairs),
        );
        p.insert(
            "three".to_string(),
            serde_json::json!(m.groups_with_three_plus_same_major),
        );
        p.insert(
            "four".to_string(),
            serde_json::json!(m.groups_with_four_plus_same_major),
        );
        reasons.push(AllocationRecommendationReason::new(
            AllocationRecommendationReasonCode::MajorDistribution,
            p,
        ));

        if m.groups_with_three_plus_same_major > 0 {
            let mut p = HashMap::new();
            p.insert(
                "three".to_string(),
                serde_json::json!(m.groups_with_three_plus_same_major),
            );
            p.insert(
                "four".to_string(),
                serde_json::json!(m.groups_with_four_plus_same_major),
            );
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::MajorConcentrationRemains,
                p,
            ));
        }

        if m.unknown_major_students > 0 {
            let mut p = HashMap::new();
            p.insert(
                "students".to_string(),
                serde_json::json!(m.unknown_major_students),
            );
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::UnknownMajors,
                p,
            ));
        }

        if m.valid_drafts_before > 0 {
            let mut p = HashMap::new();
            p.insert(
                "preserved".to_string(),
                serde_json::json!(m.valid_drafts_preserved),
            );
            p.insert(
                "total".to_string(),
                serde_json::json!(m.valid_drafts_before),
            );
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::ValidDraftsPreserved,
                p,
            ));
        }

        if m.leaders_before > 0 {
            let mut p = HashMap::new();
            p.insert(
                "preserved".to_string(),
                serde_json::json!(m.leaders_preserved),
            );
            p.insert("total".to_string(), serde_json::json!(m.leaders_before));
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::LeadersPreserved,
                p,
            ));

            let mut p = HashMap::new();
            p.insert("students".to_string(), serde_json::json!(m.moved_students));
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::StudentMovements,
                p,
            ));
        }

        if m.unassigned_allocated > 0 {
            let mut p = HashMap::new();
            p.insert(
                "students".to_string(),
                serde_json::json!(m.unassigned_allocated),
            );
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::UnassignedAllocated,
                p,
            ));
        }

        if m.protected_groups > 0 {
            let mut p = HashMap::new();
            p.insert("groups".to_string(), serde_json::json!(m.protected_groups));
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::ProtectedUnchanged,
                p,
            ));
        }

        if let Some(score) = m.average_group_score {
            let mut p = HashMap::new();
            p.insert("score".to_string(), serde_json::json!(score));
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::GroupScore,
                p,
            ));
        }

        if equivalent > 1 {
            let mut p = HashMap::new();
            p.insert("plans".to_string(), serde_json::json!(equivalent));
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::EquivalentPlans,
                p,
            ));
        }

        if !selected.search_complete {
            reasons.push(AllocationRecommendationReason::new(
                AllocationRecommendationReasonCode::SearchNotExhaustive,
                HashMap::new(),
            ));
        }

        reasons
    }
}
