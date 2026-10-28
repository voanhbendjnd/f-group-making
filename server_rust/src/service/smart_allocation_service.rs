use rand::seq::SliceRandom;
use rand::SeedableRng;
use std::collections::{BTreeMap, HashMap, HashSet};

use crate::domain::{GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::allocation::{
    AllocationReason, AllocationReasonCode, AllocationResultDTO, AllocationResultStatus,
    AllocationSnapshotDTO, CheckedTarget, Optimization, PlannedGroup, PreliminaryRange, Suggestion,
};
use crate::dto::group::GroupMemberDTO;
use crate::dto::rule::GroupingRuleDTO;
use crate::error::AppError;
use crate::service::allocation_balance_policy::AllocationBalancePolicy;
use crate::service::group_rule_validation_service::GroupRuleValidationService;
use crate::service::group_score_service::GroupScoreService;

#[derive(Debug, Clone, Copy)]
pub struct SearchLimits {
    pub maximum_nodes: i64,
    pub maximum_depth: usize,
}

impl SearchLimits {
    pub fn new(maximum_nodes: i64, maximum_depth: usize) -> Result<Self, AppError> {
        if maximum_nodes < 1 || maximum_depth < 1 {
            return Err(AppError::bad_request(
                "Invalid search limits",
                "allocation",
                "invalidSearchLimits",
            ));
        }
        Ok(Self {
            maximum_nodes,
            maximum_depth,
        })
    }

    pub fn defaults() -> Self {
        Self {
            maximum_nodes: 100_000,
            maximum_depth: 256,
        }
    }
}

#[derive(Debug, Clone)]
struct ExistingGroup {
    id: Option<i64>,
    name: String,
    status: GroupStatus,
    leader_id: Option<i64>,
    members: Vec<GroupMemberDTO>,
}

impl ExistingGroup {
    fn key(&self) -> String {
        match self.id {
            Some(id) => format!("group:{}", id),
            None => format!("new:{}", self.name),
        }
    }
}

struct Context {
    rules: Vec<GroupingRuleDTO>,
    students: BTreeMap<i64, GroupMemberDTO>,
    groups: Vec<ExistingGroup>,
    drafts: Vec<ExistingGroup>,
    protected_groups: Vec<ExistingGroup>,
    origins: HashMap<i64, i64>,
    valid_draft_ids: HashSet<i64>,
    pool: Vec<GroupMemberDTO>,
    warnings: Vec<AllocationReason>,
    minimum_members: i32,
    maximum_members: i32,
    minimum_majors: i32,
    maximum_majors: i32,
    minimum_se: i32,
    minimum_groups: i32,
    maximum_groups: i32,
}

impl Context {
    fn new(snapshot: &AllocationSnapshotDTO) -> Result<Self, AppError> {
        if snapshot.class_id < 1 || snapshot.deadline_id < 1 {
            return Err(AppError::bad_request(
                "Invalid class/session",
                "allocation",
                "invalidAllocationScope",
            ));
        }

        let mut configured: HashMap<GroupingRuleCode, GroupingRuleDTO> = HashMap::new();
        for rule in &snapshot.rules {
            if rule.value < rule.code.minimum_value() {
                return Err(AppError::bad_request(
                    "Invalid rules",
                    "allocation",
                    "invalidRules",
                ));
            }
            if configured.insert(rule.code.clone(), rule.clone()).is_some() {
                return Err(AppError::bad_request(
                    "Duplicate rule configured",
                    "allocation",
                    "invalidRules",
                ));
            }
        }

        let rules: Vec<GroupingRuleDTO> = GroupingRuleCode::all()
            .iter()
            .map(|code| {
                configured
                    .get(code)
                    .cloned()
                    .unwrap_or_else(|| GroupingRuleDTO {
                        code: code.clone(),
                        value: code.suggested_value(),
                        status: code.is_enabled_by_default(),
                    })
            })
            .collect();

        let bound = |code: GroupingRuleCode, fallback: i32| -> i32 {
            rules
                .iter()
                .find(|r| r.code == code && r.status)
                .map(|r| r.value)
                .unwrap_or(fallback)
        };

        let minimum_majors = bound(GroupingRuleCode::MIN_MAJORS_PER_GROUP, 0);
        let maximum_majors = bound(GroupingRuleCode::MAX_MAJORS_PER_GROUP, i32::MAX);
        let minimum_se = bound(GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP, 0);
        let minimum_members = 1.max(
            bound(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 1).max(minimum_majors.max(minimum_se)),
        );
        let maximum_members = bound(GroupingRuleCode::MAX_MEMBERS_PER_GROUP, i32::MAX);
        let minimum_groups = bound(GroupingRuleCode::MIN_GROUPS_PER_CLASS, 1);
        let maximum_groups = bound(GroupingRuleCode::MAX_GROUPS_PER_CLASS, i32::MAX);

        let mut students: BTreeMap<i64, GroupMemberDTO> = BTreeMap::new();
        for student in &snapshot.students {
            let sid = student.student_id;
            if sid < 1 || students.insert(sid, student.clone()).is_some() {
                return Err(AppError::bad_request(
                    "Duplicate or invalid student",
                    "allocation",
                    "invalidStudent",
                ));
            }
        }

        let mut groups = Vec::new();
        let mut drafts = Vec::new();
        let mut protected_groups = Vec::new();
        let mut origins = HashMap::new();
        let mut valid_draft_ids = HashSet::new();
        let mut warnings = Vec::new();
        let mut seen_group_ids = HashSet::new();

        for group in &snapshot.groups {
            let gid = group.id;
            if gid < 1 {
                return Err(AppError::bad_request(
                    "Invalid group ID",
                    "allocation",
                    "invalidGroup",
                ));
            }
            if !seen_group_ids.insert(gid) {
                return Err(AppError::bad_request(
                    "Duplicate group ID",
                    "allocation",
                    "invalidGroup",
                ));
            }
            if group.school_class_id != snapshot.class_id
                || group.deadline_id != snapshot.deadline_id
            {
                return Err(AppError::bad_request(
                    "Invalid group scope",
                    "allocation",
                    "invalidGroup",
                ));
            }
            if group.status == GroupStatus::DISBANDED {
                if !group.members.is_empty() {
                    return Err(AppError::bad_request(
                        "Disbanded group has members",
                        "allocation",
                        "invalidGroup",
                    ));
                }
                continue;
            }
            if group.members.is_empty() {
                return Err(AppError::bad_request(
                    "Group has no valid leader",
                    "allocation",
                    "invalidGroup",
                ));
            }

            let mut members = Vec::new();
            let mut leaders = 0;
            for member in &group.members {
                let sid = member.student_id;
                if !students.contains_key(&sid) || origins.insert(sid, gid).is_some() {
                    return Err(AppError::bad_request(
                        "Invalid or duplicate membership",
                        "allocation",
                        "invalidGroup",
                    ));
                }
                let canonical = &students[&sid];
                if member.major_id != canonical.major_id
                    || member.major_code != canonical.major_code
                {
                    return Err(AppError::bad_request(
                        "Inconsistent student academic data",
                        "allocation",
                        "invalidGroup",
                    ));
                }
                if member.role == GroupMemberRole::LEADER {
                    leaders += 1;
                    if sid != group.leader_id {
                        return Err(AppError::bad_request(
                            "Leader mismatch",
                            "allocation",
                            "invalidGroup",
                        ));
                    }
                }
                members.push(member.clone());
            }

            if leaders != 1 {
                return Err(AppError::bad_request(
                    "Exactly one leader required",
                    "allocation",
                    "invalidGroup",
                ));
            }

            let row = ExistingGroup {
                id: Some(gid),
                name: group.name.clone(),
                status: group.status,
                leader_id: Some(group.leader_id),
                members: members.clone(),
            };
            groups.push(row.clone());

            let valid = GroupRuleValidationService::are_all_rules_passed(
                &GroupRuleValidationService::evaluate_rules(&rules, &members),
            );

            match group.status {
                GroupStatus::PENDING | GroupStatus::ACCEPTED => {
                    protected_groups.push(row);
                    if !valid {
                        warnings.push(AllocationReason::new(
                            AllocationReasonCode::ProtectedRuleWarning,
                            gid,
                            0,
                        ));
                    }
                }
                GroupStatus::OPEN | GroupStatus::REVOKED => {
                    if valid {
                        valid_draft_ids.insert(gid);
                    }
                    drafts.push(row);
                }
                _ => {
                    return Err(AppError::bad_request(
                        "Unsupported group state",
                        "allocation",
                        "invalidGroup",
                    ))
                }
            }
        }

        groups.sort_by_key(|g| g.id);

        let fixed_students: HashSet<i64> = protected_groups
            .iter()
            .flat_map(|g| g.members.iter().map(|m| m.student_id))
            .collect();

        let pool: Vec<GroupMemberDTO> = students
            .values()
            .filter(|s| !fixed_students.contains(&s.student_id))
            .cloned()
            .collect();

        Ok(Self {
            rules,
            students,
            groups,
            drafts,
            protected_groups,
            origins,
            valid_draft_ids,
            pool,
            warnings,
            minimum_members,
            maximum_members,
            minimum_majors,
            maximum_majors,
            minimum_se,
            minimum_groups,
            maximum_groups,
        })
    }

    fn valid(&self, members: &[GroupMemberDTO]) -> bool {
        GroupRuleValidationService::are_all_rules_passed(
            &GroupRuleValidationService::evaluate_rules(&self.rules, members),
        )
    }

    fn bound(&self, code: GroupingRuleCode, fallback: i32) -> i32 {
        self.rules
            .iter()
            .find(|r| r.code == code && r.status)
            .map(|r| r.value)
            .unwrap_or(fallback)
    }
}

pub struct SmartAllocationService;

impl SmartAllocationService {
    pub fn preliminary_range(
        snapshot: &AllocationSnapshotDTO,
    ) -> Result<PreliminaryRange, AppError> {
        let context = Context::new(snapshot)?;
        Ok(Self::range(&context))
    }

    pub fn allocate(
        snapshot: &AllocationSnapshotDTO,
        target: i32,
        seed: i64,
        limits: SearchLimits,
    ) -> Result<AllocationResultDTO, AppError> {
        let context = Context::new(snapshot)?;
        let range = Self::range(&context);
        let failures = Self::target_failures(&context, target);
        if !failures.is_empty() {
            return Ok(Self::result(
                AllocationResultStatus::ProvenInfeasible,
                target,
                seed,
                range,
                vec![],
                vec![],
                failures,
                0,
                true,
                None,
            ));
        }

        let search_depth = context.pool.len()
            + context
                .drafts
                .len()
                .max(target.saturating_sub(context.protected_groups.len() as i32) as usize);
        if search_depth > limits.maximum_depth {
            return Ok(Self::result(
                AllocationResultStatus::SearchLimitReached,
                target,
                seed,
                range,
                vec![],
                vec![],
                vec![AllocationReason::new(
                    AllocationReasonCode::SearchDepthLimit,
                    search_depth as i64,
                    limits.maximum_depth as i64,
                )],
                0,
                false,
                None,
            ));
        }

        let mut search = Search::new(&context, target, seed, limits);
        search.select(0, &mut vec![]);

        if search.best.is_none() {
            let status = if search.limited {
                AllocationResultStatus::SearchLimitReached
            } else {
                AllocationResultStatus::ProvenInfeasible
            };
            let code = if search.limited {
                AllocationReasonCode::SearchBudgetExhausted
            } else {
                AllocationReasonCode::NoPartition
            };
            return Ok(Self::result(
                status,
                target,
                seed,
                range,
                vec![],
                vec![],
                vec![AllocationReason::new(
                    code,
                    search.nodes,
                    limits.maximum_nodes,
                )],
                search.nodes,
                !search.limited,
                None,
            ));
        }

        search.improve_major_balance();

        let mut reasons = context.warnings.clone();
        if search.limited {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::SearchBudgetExhausted,
                search.nodes,
                limits.maximum_nodes,
            ));
        }

        Ok(Self::result(
            AllocationResultStatus::Feasible,
            target,
            seed,
            range,
            search.best.unwrap_or_default(),
            search.disbanded,
            reasons,
            search.nodes,
            !search.limited,
            search.best_objective,
        ))
    }

    pub fn suggest(snapshot: &AllocationSnapshotDTO, seed: i64) -> Result<Suggestion, AppError> {
        let context = Context::new(snapshot)?;
        let range = Self::range(&context);
        if !range.has_candidates() {
            return Ok(Suggestion {
                suggested_count: None,
                status: AllocationResultStatus::ProvenInfeasible,
                reasons: range.reasons.clone(),
                checked_targets: vec![],
            });
        }

        let mut preferred = context.groups.len() as i32;
        if context.drafts.is_empty() || context.valid_draft_ids.len() != context.drafts.len() {
            let average = if context.maximum_members == i32::MAX {
                context.minimum_members
            } else {
                ((context.minimum_members as i64 + context.maximum_members as i64) / 2) as i32
            };
            preferred = context.protected_groups.len() as i32
                + Self::ceil(context.pool.len() as i32, 1.max(average));
        }

        let desired = preferred;
        let mut candidates: Vec<i32> = (range.minimum..=range.maximum).collect();
        candidates.sort_by(|&a, &b| {
            let diff_a = (a - desired).abs();
            let diff_b = (b - desired).abs();
            diff_a.cmp(&diff_b).then_with(|| a.cmp(&b))
        });

        let mut checked = Vec::new();
        let mut unknown = false;

        for &count in candidates.iter().take(12) {
            let allocation = Self::allocate(snapshot, count, seed, SearchLimits::defaults())?;
            checked.push(CheckedTarget {
                target: count,
                status: allocation.status,
            });

            if allocation.status == AllocationResultStatus::Feasible {
                let mut reasons = Vec::new();
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::ValidatedSuggestion,
                    count as i64,
                    context.students.len() as i64,
                ));
                if !context.pool.is_empty() {
                    reasons.push(AllocationReason::new(
                        AllocationReasonCode::SuggestedBalancedSize,
                        context.pool.len() as i64,
                        (count - context.protected_groups.len() as i32) as i64,
                    ));
                }
                if !context.valid_draft_ids.is_empty() {
                    let preserved = allocation
                        .optimization
                        .as_ref()
                        .map(|o| o.valid_groups_preserved)
                        .unwrap_or(0);
                    reasons.push(AllocationReason::new(
                        AllocationReasonCode::SuggestedPreservesValidGroups,
                        preserved as i64,
                        context.valid_draft_ids.len() as i64,
                    ));
                }
                if !context.protected_groups.is_empty() {
                    reasons.push(AllocationReason::new(
                        AllocationReasonCode::ProtectedCountsIncluded,
                        context.protected_groups.len() as i64,
                        count as i64,
                    ));
                }
                return Ok(Suggestion {
                    suggested_count: Some(count),
                    status: AllocationResultStatus::Feasible,
                    reasons,
                    checked_targets: checked,
                });
            }

            if allocation.status == AllocationResultStatus::SearchLimitReached {
                unknown = true;
            }
        }

        let status = if unknown || checked.len() < candidates.len() {
            AllocationResultStatus::SearchLimitReached
        } else {
            AllocationResultStatus::ProvenInfeasible
        };

        Ok(Suggestion {
            suggested_count: None,
            status,
            reasons: vec![AllocationReason::new(
                AllocationReasonCode::NoConfirmedSuggestion,
                checked.len() as i64,
                candidates.len() as i64,
            )],
            checked_targets: checked,
        })
    }

    fn range(c: &Context) -> PreliminaryRange {
        let fixed = c.protected_groups.len() as i32;
        let mut lower = 1.max(
            c.minimum_groups
                .max(fixed + Self::ceil(c.pool.len() as i32, c.maximum_members)),
        );
        let mut upper = c
            .maximum_groups
            .min(fixed + (c.pool.len() as i32) / c.minimum_members);

        if c.minimum_se > 0 {
            let se_count = c.pool.iter().filter(|s| Self::is_se(s)).count() as i32;
            upper = upper.min(fixed + se_count / c.minimum_se);
        }

        let mut reasons = Vec::new();
        let mut major_counts: HashMap<i32, i64> = HashMap::new();
        for s in &c.pool {
            if let Some(m) = s.major_id {
                *major_counts.entry(m).or_insert(0) += 1;
            }
        }

        while upper >= lower && upper > fixed {
            let editable = upper - fixed;
            let coverage: i64 = major_counts
                .values()
                .map(|&count| count.min(editable as i64))
                .sum();
            if coverage >= (editable as i64) * (c.minimum_majors as i64) {
                break;
            }
            upper -= 1;
        }

        if c.minimum_members > c.maximum_members || c.minimum_majors > c.maximum_majors {
            upper = lower - 1;
            reasons.push(AllocationReason::new(
                AllocationReasonCode::RuleBoundsConflict,
                0,
                0,
            ));
        }

        if lower > upper {
            reasons.extend(Self::target_failures(c, lower));
        } else {
            while lower <= upper && !Self::balanced_target(c, lower) {
                lower += 1;
            }
            while upper >= lower && !Self::balanced_target(c, upper) {
                upper -= 1;
            }
            if lower > upper {
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::BalancedSizeConflict,
                    c.students.len() as i64,
                    1,
                ));
            }
            reasons.push(AllocationReason::new(
                AllocationReasonCode::PreliminaryOnly,
                lower as i64,
                upper as i64,
            ));
        }

        PreliminaryRange {
            minimum: lower,
            maximum: upper,
            protected_groups: fixed,
            editable_students: c.pool.len() as i32,
            reasons,
        }
    }

    fn target_failures(c: &Context, target: i32) -> Vec<AllocationReason> {
        let mut reasons = Vec::new();
        let fixed = c.protected_groups.len() as i32;
        let editable = target - fixed;

        if target < 1 {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::TargetMustBePositive,
                target as i64,
                1,
            ));
        }
        if editable < 0 {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::TargetBelowProtected,
                target as i64,
                fixed as i64,
            ));
        }
        if target < c.minimum_groups || target > c.maximum_groups {
            let req = if target < c.minimum_groups {
                c.minimum_groups
            } else {
                c.maximum_groups
            };
            reasons.push(AllocationReason::new(
                AllocationReasonCode::ClassGroupBound,
                target as i64,
                req as i64,
            ));
        }
        if c.minimum_members > c.maximum_members || c.minimum_majors > c.maximum_majors {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::RuleBoundsConflict,
                0,
                0,
            ));
        }
        if target > 0 && !Self::balanced_target(c, target) {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::BalancedSizeConflict,
                c.students.len() as i64,
                target as i64,
            ));
        }
        if editable == 0 && !c.pool.is_empty() {
            reasons.push(AllocationReason::new(
                AllocationReasonCode::NoEditableGroup,
                c.pool.len() as i64,
                0,
            ));
        }
        if editable > 0 {
            let max_capacity = (editable as i64) * (c.maximum_members as i64);
            if max_capacity < c.pool.len() as i64 {
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::MemberCapacity,
                    c.pool.len() as i64,
                    max_capacity,
                ));
            }
            let min_capacity = (editable as i64) * (c.minimum_members as i64);
            if min_capacity > c.pool.len() as i64 {
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::InsufficientMembers,
                    c.pool.len() as i64,
                    min_capacity,
                ));
            }
            let se = c.pool.iter().filter(|s| Self::is_se(s)).count() as i64;
            let req_se = (editable as i64) * (c.minimum_se as i64);
            if se < req_se {
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::InsufficientSe,
                    se,
                    req_se,
                ));
            }
            let mut majors: HashMap<i32, i64> = HashMap::new();
            for s in &c.pool {
                if let Some(m) = s.major_id {
                    *majors.entry(m).or_insert(0) += 1;
                }
            }
            let coverage: i64 = majors
                .values()
                .map(|&count| count.min(editable as i64))
                .sum();
            let req_majors = (editable as i64) * (c.minimum_majors as i64);
            if coverage < req_majors {
                reasons.push(AllocationReason::new(
                    AllocationReasonCode::InsufficientMajors,
                    coverage,
                    req_majors,
                ));
            }
        }
        reasons
    }

    fn balanced_target(c: &Context, target: i32) -> bool {
        let low = AllocationBalancePolicy::minimum_size(c.students.len() as i32, target);
        let high = AllocationBalancePolicy::maximum_size(c.students.len() as i32, target);

        if c.protected_groups.iter().any(|g| {
            let len = g.members.len() as i32;
            len < low || len > high
        }) {
            return false;
        }

        let editable = target - c.protected_groups.len() as i32;
        if editable < 0 || low < 1 {
            return false;
        }

        let minimum = c.minimum_members.max(low);
        let maximum = c.maximum_members.min(high);

        if editable == 0 {
            c.pool.is_empty()
        } else {
            minimum <= maximum
                && (minimum as i64) * (editable as i64) <= (c.pool.len() as i64)
                && (maximum as i64) * (editable as i64) >= (c.pool.len() as i64)
        }
    }

    pub fn major_concentration(members: &[GroupMemberDTO]) -> i64 {
        let mut counts: HashMap<i32, i64> = HashMap::new();
        for m in members {
            if let Some(id) = m.major_id {
                *counts.entry(id).or_insert(0) += 1;
            }
        }
        counts.values().map(|&c| c * (c - 1) / 2).sum()
    }

    fn admission_utility(c: &Context, members: &[GroupMemberDTO], student: &GroupMemberDTO) -> i32 {
        let mut score = 50;
        if Self::is_se(student)
            && members.iter().filter(|s| Self::is_se(s)).count() < c.minimum_se as usize
        {
            score += 40;
        }
        let majors = Self::majors(members);
        if majors.len() < c.minimum_majors as usize
            && student.major_id.is_some()
            && !majors.contains(&student.major_id.unwrap())
        {
            score += 25;
        }
        if members.len() < c.bound(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 0) as usize {
            score += 15;
        }
        score.min(100)
    }

    fn better(
        a: &Optimization,
        major_concentration: i64,
        b: &Optimization,
        previous_concentration: i64,
    ) -> bool {
        if a.valid_groups_preserved != b.valid_groups_preserved {
            return a.valid_groups_preserved > b.valid_groups_preserved;
        }
        if a.leaders_preserved != b.leaders_preserved {
            return a.leaders_preserved > b.leaders_preserved;
        }
        if a.moved_students != b.moved_students {
            return a.moved_students < b.moved_students;
        }
        if major_concentration != previous_concentration {
            return major_concentration < previous_concentration;
        }
        a.compatibility_utility > b.compatibility_utility
    }

    fn major_count(members: &[GroupMemberDTO], major_id: Option<i32>) -> i64 {
        match major_id {
            Some(id) => members.iter().filter(|m| m.major_id == Some(id)).count() as i64,
            None => 0,
        }
    }

    fn majors(members: &[GroupMemberDTO]) -> HashSet<i32> {
        members.iter().filter_map(|m| m.major_id).collect()
    }

    fn is_se(student: &GroupMemberDTO) -> bool {
        student
            .major_code
            .as_deref()
            .map(|s| s.trim().eq_ignore_ascii_case("SE"))
            .unwrap_or(false)
    }

    fn ceil(value: i32, divisor: i32) -> i32 {
        ((value as i64 + divisor as i64 - 1) / divisor as i64) as i32
    }

    #[allow(clippy::too_many_arguments)]
    fn result(
        status: AllocationResultStatus,
        target: i32,
        seed: i64,
        range: PreliminaryRange,
        groups: Vec<PlannedGroup>,
        disbanded: Vec<i64>,
        reasons: Vec<AllocationReason>,
        nodes: i64,
        complete: bool,
        objective: Option<Optimization>,
    ) -> AllocationResultDTO {
        AllocationResultDTO {
            status,
            target_group_count: target,
            seed,
            range,
            groups,
            disbanded_group_ids: disbanded,
            reasons,
            visited_nodes: nodes,
            search_complete: complete,
            optimization: objective,
        }
    }
}

#[derive(Clone, Copy)]
struct SuffixStat {
    se_left: usize,
    remaining_majors_mask: u64,
    known_majors: usize,
}

#[derive(Clone)]
struct FastSlot<'a> {
    members: Vec<&'a GroupMemberDTO>,
    se_count: usize,
    major_mask: u64,
    major_counts: Vec<usize>,
}

struct Search<'a> {
    c: &'a Context,
    target: i32,
    limits: SearchLimits,
    rng: rand::rngs::StdRng,
    candidates: Vec<ExistingGroup>,
    ordered: Vec<&'a GroupMemberDTO>,
    assignment_order: Vec<&'a GroupMemberDTO>,
    minimum_members: usize,
    maximum_members: usize,
    nodes: i64,
    limited: bool,
    best: Option<Vec<PlannedGroup>>,
    disbanded: Vec<i64>,
    best_objective: Option<Optimization>,
    best_major_concentration: i64,
    major_map: HashMap<i32, usize>,
    num_majors: usize,
}

impl<'a> Search<'a> {
    fn new(c: &'a Context, target: i32, seed: i64, limits: SearchLimits) -> Self {
        let min_m = c.minimum_members.max(AllocationBalancePolicy::minimum_size(
            c.students.len() as i32,
            target,
        )) as usize;
        let max_m = c.maximum_members.min(AllocationBalancePolicy::maximum_size(
            c.students.len() as i32,
            target,
        )) as usize;

        let mut rng = rand::rngs::StdRng::seed_from_u64(seed as u64);

        let mut candidates: Vec<ExistingGroup> = c.drafts.clone();
        candidates.sort_by_key(|g| g.id);
        candidates.shuffle(&mut rng);
        candidates.sort_by_key(|g| !c.valid_draft_ids.contains(&g.id.unwrap_or(0)));

        let mut names: HashSet<String> = c
            .groups
            .iter()
            .map(|g| g.name.trim().to_lowercase())
            .collect();
        let mut next_name = 1;
        let extra_needed = (target as usize).saturating_sub(c.groups.len());
        for _ in 0..extra_needed {
            let mut name;
            loop {
                name = format!("Group {:02}", next_name);
                next_name += 1;
                if names.insert(name.to_lowercase()) {
                    break;
                }
            }
            candidates.push(ExistingGroup {
                id: None,
                name,
                status: GroupStatus::OPEN,
                leader_id: None,
                members: vec![],
            });
        }

        let mut major_map: HashMap<i32, usize> = HashMap::new();
        let mut num_majors = 0;
        for s in c.students.values() {
            if let Some(m) = s.major_id {
                if let std::collections::hash_map::Entry::Vacant(e) = major_map.entry(m) {
                    e.insert(num_majors);
                    num_majors += 1;
                }
            }
        }

        let mut ordered: Vec<&'a GroupMemberDTO> = c.pool.iter().collect();
        let mut frequency: HashMap<i32, i64> = HashMap::new();
        for s in &c.pool {
            if let Some(m) = s.major_id {
                *frequency.entry(m).or_insert(0) += 1;
            }
        }
        let leaders: HashSet<i64> = c.drafts.iter().filter_map(|g| g.leader_id).collect();

        ordered.shuffle(&mut rng);
        ordered.sort_by(|a, b| {
            let se_a = !SmartAllocationService::is_se(a);
            let se_b = !SmartAllocationService::is_se(b);
            se_a.cmp(&se_b)
                .then_with(|| {
                    let freq_a = a
                        .major_id
                        .and_then(|m| frequency.get(&m))
                        .copied()
                        .unwrap_or(i64::MAX);
                    let freq_b = b
                        .major_id
                        .and_then(|m| frequency.get(&m))
                        .copied()
                        .unwrap_or(i64::MAX);
                    freq_a.cmp(&freq_b)
                })
                .then_with(|| {
                    let lead_a = !leaders.contains(&a.student_id);
                    let lead_b = !leaders.contains(&b.student_id);
                    lead_a.cmp(&lead_b)
                })
        });

        Self {
            c,
            target,
            limits,
            rng,
            candidates,
            ordered: ordered.clone(),
            assignment_order: ordered,
            minimum_members: min_m,
            maximum_members: max_m,
            nodes: 0,
            limited: false,
            best: None,
            disbanded: vec![],
            best_objective: None,
            best_major_concentration: i64::MAX,
            major_map,
            num_majors: num_majors.max(1),
        }
    }

    fn visit(&mut self) -> bool {
        if self.nodes >= self.limits.maximum_nodes {
            self.limited = true;
            return false;
        }
        self.nodes += 1;
        true
    }

    fn build_suffix_stats(&self, list: &[&'a GroupMemberDTO]) -> Vec<SuffixStat> {
        let n = list.len();
        let mut stats = vec![
            SuffixStat {
                se_left: 0,
                remaining_majors_mask: 0,
                known_majors: 0,
            };
            n + 1
        ];

        let mut se_left = 0;
        let mut mask = 0u64;
        let mut known = 0;

        for i in (0..n).rev() {
            let s = list[i];
            if SmartAllocationService::is_se(s) {
                se_left += 1;
            }
            if let Some(mid) = s.major_id {
                if let Some(&midx) = self.major_map.get(&mid) {
                    mask |= 1u64 << midx;
                }
                known += 1;
            }
            stats[i] = SuffixStat {
                se_left,
                remaining_majors_mask: mask,
                known_majors: known,
            };
        }
        stats
    }

    fn push_student(
        &self,
        slot: &mut FastSlot<'a>,
        student: &'a GroupMemberDTO,
        student_midx: Option<usize>,
    ) {
        slot.members.push(student);
        if SmartAllocationService::is_se(student) {
            slot.se_count += 1;
        }
        if let Some(midx) = student_midx {
            slot.major_mask |= 1u64 << midx;
            slot.major_counts[midx] += 1;
        }
    }

    fn pop_student(
        &self,
        slot: &mut FastSlot<'a>,
        student: &'a GroupMemberDTO,
        student_midx: Option<usize>,
    ) {
        slot.members.pop();
        if SmartAllocationService::is_se(student) {
            slot.se_count -= 1;
        }
        if let Some(midx) = student_midx {
            slot.major_counts[midx] -= 1;
            if slot.major_counts[midx] == 0 {
                slot.major_mask &= !(1u64 << midx);
            }
        }
    }

    fn select(&mut self, index: usize, chosen: &mut Vec<ExistingGroup>) {
        if self.limited || !self.visit() {
            return;
        }

        let need = self.target as usize - self.c.protected_groups.len() - chosen.len();
        if self.candidates.len() - index < need {
            return;
        }

        if need == 0 {
            let mut slots: Vec<FastSlot<'a>> = (0..chosen.len())
                .map(|_| FastSlot {
                    members: Vec::with_capacity(self.maximum_members + 1),
                    se_count: 0,
                    major_mask: 0,
                    major_counts: vec![0; self.num_majors],
                })
                .collect();
            let mut preserved: HashSet<i64> = HashSet::new();

            for (i, group) in chosen.iter().enumerate() {
                if let Some(gid) = group.id {
                    if self.c.valid_draft_ids.contains(&gid)
                        && group.members.len() >= self.minimum_members
                        && group.members.len() <= self.maximum_members
                    {
                        for m in &group.members {
                            preserved.insert(m.student_id);
                            if let Some(student_ref) = self.c.students.get(&m.student_id) {
                                let midx = student_ref
                                    .major_id
                                    .and_then(|id| self.major_map.get(&id).copied());
                                self.push_student(&mut slots[i], student_ref, midx);
                            }
                        }
                    }
                }
            }

            if !preserved.is_empty() {
                self.assignment_order = self
                    .ordered
                    .iter()
                    .copied()
                    .filter(|m| !preserved.contains(&m.student_id))
                    .collect();
                let suffix = self.build_suffix_stats(&self.assignment_order);
                self.assign(0, chosen, &mut slots, &suffix);
                if self.limited {
                    return;
                }
            }

            for s in &mut slots {
                s.members.clear();
                s.se_count = 0;
                s.major_mask = 0;
                s.major_counts.fill(0);
            }
            self.assignment_order = self.ordered.clone();
            let suffix = self.build_suffix_stats(&self.assignment_order);
            self.assign(0, chosen, &mut slots, &suffix);
            return;
        }

        if index == self.candidates.len() {
            return;
        }

        chosen.push(self.candidates[index].clone());
        self.select(index + 1, chosen);
        chosen.pop();

        self.select(index + 1, chosen);
    }

    fn assign(
        &mut self,
        index: usize,
        chosen: &[ExistingGroup],
        slots: &mut [FastSlot<'a>],
        suffix: &[SuffixStat],
    ) {
        if self.limited || !self.visit() || !self.can_complete(index, slots, suffix) {
            return;
        }

        if index == self.assignment_order.len() {
            let full_slots: Vec<Vec<GroupMemberDTO>> = slots
                .iter()
                .map(|s| s.members.iter().map(|&m| m.clone()).collect())
                .collect();
            self.consider(chosen, &full_slots);
            return;
        }

        let student = self.assignment_order[index];
        let student_midx = student
            .major_id
            .and_then(|id| self.major_map.get(&id).copied());
        let n = slots.len();
        let mut positions = [0usize; 64];
        for (i, p) in positions.iter_mut().enumerate().take(n) {
            *p = i;
        }
        let pos_slice = &mut positions[..n];
        pos_slice.shuffle(&mut self.rng);

        pos_slice.sort_by(|&a, &b| {
            let orig_a = self.c.origins.get(&student.student_id) != chosen[a].id.as_ref();
            let orig_b = self.c.origins.get(&student.student_id) != chosen[b].id.as_ref();
            orig_a
                .cmp(&orig_b)
                .then_with(|| {
                    let util_a = self.admission_utility_fast(&slots[a], student, student_midx);
                    let util_b = self.admission_utility_fast(&slots[b], student, student_midx);
                    util_b.cmp(&util_a)
                })
                .then_with(|| {
                    let count_a = match student_midx {
                        Some(midx) => slots[a].major_counts[midx] as i64,
                        None => 0,
                    };
                    let count_b = match student_midx {
                        Some(midx) => slots[b].major_counts[midx] as i64,
                        None => 0,
                    };
                    count_a.cmp(&count_b)
                })
                .then_with(|| slots[a].members.len().cmp(&slots[b].members.len()))
        });

        let mut seen_empty_virtual = false;
        for &pos in pos_slice.iter() {
            if slots[pos].members.len() >= self.maximum_members {
                continue;
            }

            if slots[pos].members.is_empty()
                && chosen[pos].id.is_none()
                && chosen[pos].leader_id.is_none()
            {
                if seen_empty_virtual {
                    continue;
                }
                seen_empty_virtual = true;
            }

            let majors_count = if let Some(midx) = student_midx {
                (slots[pos].major_mask | (1u64 << midx)).count_ones() as usize
            } else {
                slots[pos].major_mask.count_ones() as usize
            };
            if majors_count > self.c.maximum_majors as usize {
                continue;
            }

            self.push_student(&mut slots[pos], student, student_midx);
            self.assign(index + 1, chosen, slots, suffix);
            self.pop_student(&mut slots[pos], student, student_midx);

            if self.limited {
                return;
            }
        }
    }

    fn can_complete(&self, index: usize, slots: &[FastSlot<'a>], suffix: &[SuffixStat]) -> bool {
        let remaining = self.assignment_order.len() - index;
        let stat = &suffix[index];

        let mut missing_people = 0;
        let mut capacity = 0;
        let mut missing_se = 0;
        let mut missing_majors = 0;

        for slot in slots {
            let len = slot.members.len();
            if len < self.minimum_members {
                missing_people += self.minimum_members - len;
            }
            capacity += self.maximum_members.saturating_sub(len);

            if slot.se_count < self.c.minimum_se as usize {
                missing_se += self.c.minimum_se as usize - slot.se_count;
            }

            let slot_majors = slot.major_mask.count_ones() as usize;
            if slot_majors < self.c.minimum_majors as usize {
                missing_majors += self.c.minimum_majors as usize - slot_majors;
            }

            let union_mask = slot.major_mask | stat.remaining_majors_mask;
            if (union_mask.count_ones() as usize) < self.c.minimum_majors as usize {
                return false;
            }
        }

        missing_people <= remaining
            && capacity >= remaining
            && missing_se <= stat.se_left
            && missing_majors <= stat.known_majors
    }

    fn admission_utility_fast(
        &self,
        slot: &FastSlot<'a>,
        student: &'a GroupMemberDTO,
        student_midx: Option<usize>,
    ) -> i32 {
        let mut score = 50;
        if SmartAllocationService::is_se(student) && slot.se_count < self.c.minimum_se as usize {
            score += 40;
        }
        let majors_count = slot.major_mask.count_ones() as usize;
        if majors_count < self.c.minimum_majors as usize {
            if let Some(midx) = student_midx {
                if (slot.major_mask & (1u64 << midx)) == 0 {
                    score += 25;
                }
            }
        }
        if slot.members.len() < self.c.bound(GroupingRuleCode::MIN_MEMBERS_PER_GROUP, 0) as usize {
            score += 15;
        }
        score.min(100)
    }

    fn consider(&mut self, chosen: &[ExistingGroup], slots: &[Vec<GroupMemberDTO>]) {
        if slots.iter().any(|m| m.is_empty() || !self.c.valid(m)) {
            return;
        }

        let mut preserved = 0;
        let mut leaders = 0;
        let mut movements = 0;
        let mut utility = 0;

        for (i, group) in chosen.iter().enumerate() {
            let members = &slots[i];
            let ids: HashSet<i64> = members.iter().map(|m| m.student_id).collect();

            if let Some(gid) = group.id {
                if self.c.valid_draft_ids.contains(&gid) {
                    let old_ids: HashSet<i64> =
                        group.members.iter().map(|m| m.student_id).collect();
                    if ids == old_ids {
                        preserved += 1;
                    }
                }
            }

            let leader = match group.leader_id {
                Some(lid) if ids.contains(&lid) => lid,
                _ => ids.iter().copied().min().unwrap_or(0),
            };

            if Some(leader) == group.leader_id {
                leaders += 1;
            }

            for student in members {
                if group.id.is_none()
                    || self.c.origins.get(&student.student_id) != group.id.as_ref()
                {
                    movements += 1;
                }
                let others: Vec<GroupMemberDTO> = members
                    .iter()
                    .filter(|s| s.student_id != student.student_id)
                    .cloned()
                    .collect();
                utility +=
                    SmartAllocationService::admission_utility(self.c, &others, student) as i64;
            }
        }

        let objective = Optimization {
            valid_groups_preserved: preserved,
            leaders_preserved: leaders,
            moved_students: movements,
            compatibility_utility: utility,
        };

        let concentration: i64 = slots
            .iter()
            .map(|s| SmartAllocationService::major_concentration(s))
            .sum();

        if let Some(ref best_obj) = self.best_objective {
            if !SmartAllocationService::better(
                &objective,
                concentration,
                best_obj,
                self.best_major_concentration,
            ) {
                return;
            }
        }

        let mut plan = Vec::new();
        for group in &self.c.protected_groups {
            plan.push(self.planned(group, group.leader_id.unwrap_or(0), &group.members, true));
        }

        for (i, group) in chosen.iter().enumerate() {
            let members = &slots[i];
            let leader = match group.leader_id {
                Some(lid) if members.iter().any(|s| s.student_id == lid) => lid,
                _ => members.iter().map(|s| s.student_id).min().unwrap_or(0),
            };
            plan.push(self.planned(group, leader, members, false));
        }

        plan.sort_by(|a, b| {
            a.group_id
                .cmp(&b.group_id)
                .then_with(|| a.plan_group_key.cmp(&b.plan_group_key))
        });

        self.best = Some(plan);
        self.best_objective = Some(objective);
        self.best_major_concentration = concentration;

        let retained: HashSet<i64> = chosen.iter().filter_map(|g| g.id).collect();
        let mut disbanded: Vec<i64> = self
            .c
            .drafts
            .iter()
            .filter_map(|g| g.id)
            .filter(|id| !retained.contains(id))
            .collect();
        disbanded.sort();
        self.disbanded = disbanded;
    }

    fn planned(
        &self,
        group: &ExistingGroup,
        leader: i64,
        members: &[GroupMemberDTO],
        fixed: bool,
    ) -> PlannedGroup {
        let copies: Vec<GroupMemberDTO> = members
            .iter()
            .map(|member| {
                let mut copy = member.clone();
                if !fixed {
                    copy.group_id = group.id.unwrap_or(0);
                    copy.role = if copy.student_id == leader {
                        GroupMemberRole::LEADER
                    } else {
                        GroupMemberRole::MEMBER
                    };
                }
                copy
            })
            .collect();

        PlannedGroup {
            group_id: group.id,
            name: group.name.clone(),
            status: group.status,
            leader_id: leader,
            protected_group: fixed,
            score: Some(GroupScoreService::evaluate_rules(&self.c.rules, &copies)),
            members: copies,
            plan_group_key: Some(group.key()),
            new_group: group.id.is_none(),
        }
    }

    fn improve_major_balance(&mut self) {
        if self.best.is_none() {
            return;
        }

        let best_plan = self.best.as_ref().unwrap();
        let by_key: HashMap<String, ExistingGroup> = self
            .candidates
            .iter()
            .map(|g| (g.key(), g.clone()))
            .collect();

        let chosen: Vec<ExistingGroup> = best_plan
            .iter()
            .filter(|g| !g.protected_group)
            .filter_map(|g| {
                g.plan_group_key
                    .as_ref()
                    .and_then(|k| by_key.get(k))
                    .cloned()
            })
            .collect();

        let mut slots: Vec<Vec<GroupMemberDTO>> = best_plan
            .iter()
            .filter(|g| !g.protected_group)
            .map(|g| g.members.clone())
            .collect();

        let mut order: Vec<usize> = (0..chosen.len()).collect();
        order.shuffle(&mut self.rng);

        let mut checks_left = 20_000.min(self.limits.maximum_nodes);

        while checks_left > 0 {
            let mut best_swap: Option<(usize, usize, usize, usize, i32, i64)> = None;

            'search_swaps: for a in 0..order.len() {
                for b in (a + 1)..order.len() {
                    let left = order[a];
                    let right = order[b];
                    let left_group = &chosen[left];
                    let right_group = &chosen[right];

                    if self.intact_valid_draft(left_group, &slots[left])
                        || self.intact_valid_draft(right_group, &slots[right])
                    {
                        continue;
                    }

                    for i in 0..slots[left].len() {
                        for j in 0..slots[right].len() {
                            checks_left -= 1;
                            if checks_left <= 0 {
                                break 'search_swaps;
                            }

                            let first = &slots[left][i];
                            let second = &slots[right][j];

                            if first.major_id.is_none()
                                || second.major_id.is_none()
                                || first.major_id == second.major_id
                                || Some(first.student_id) == left_group.leader_id
                                || Some(second.student_id) == right_group.leader_id
                            {
                                continue;
                            }

                            let delta =
                                SmartAllocationService::major_count(&slots[left], second.major_id)
                                    - SmartAllocationService::major_count(
                                        &slots[left],
                                        first.major_id,
                                    )
                                    + SmartAllocationService::major_count(
                                        &slots[right],
                                        first.major_id,
                                    )
                                    - SmartAllocationService::major_count(
                                        &slots[right],
                                        second.major_id,
                                    )
                                    + 2;

                            if delta >= 0 {
                                continue;
                            }

                            let movement_delta = self.movement(first, right_group)
                                + self.movement(second, left_group)
                                - self.movement(first, left_group)
                                - self.movement(second, right_group);

                            if movement_delta > 0 {
                                continue;
                            }

                            // Swap temporarily to check validity
                            let temp_first = slots[left][i].clone();
                            let temp_second = slots[right][j].clone();
                            slots[left][i] = temp_second;
                            slots[right][j] = temp_first;

                            let valid = self.c.valid(&slots[left]) && self.c.valid(&slots[right]);

                            // Swap back
                            let temp_second = slots[left][i].clone();
                            let temp_first = slots[right][j].clone();
                            slots[left][i] = temp_first;
                            slots[right][j] = temp_second;

                            if valid {
                                let is_better = match best_swap {
                                    None => true,
                                    Some((_, _, _, _, prev_mov, prev_delta)) => {
                                        movement_delta < prev_mov
                                            || (movement_delta == prev_mov && delta < prev_delta)
                                    }
                                };
                                if is_better {
                                    best_swap = Some((left, right, i, j, movement_delta, delta));
                                }
                            }
                        }
                    }
                }
            }

            match best_swap {
                Some((left, right, i, j, _, _)) => {
                    let temp_first = slots[left][i].clone();
                    let temp_second = slots[right][j].clone();
                    slots[left][i] = temp_second;
                    slots[right][j] = temp_first;
                }
                None => break,
            }
        }

        self.consider(&chosen, &slots);
    }

    fn intact_valid_draft(&self, group: &ExistingGroup, members: &[GroupMemberDTO]) -> bool {
        if let Some(gid) = group.id {
            if self.c.valid_draft_ids.contains(&gid) {
                let current_ids: HashSet<i64> = members.iter().map(|m| m.student_id).collect();
                let orig_ids: HashSet<i64> = group.members.iter().map(|m| m.student_id).collect();
                return current_ids == orig_ids;
            }
        }
        false
    }

    fn movement(&self, student: &GroupMemberDTO, group: &ExistingGroup) -> i32 {
        if group.id.is_none() || self.c.origins.get(&student.student_id) != group.id.as_ref() {
            1
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{GroupMemberRole, GroupingRuleCode};
    use crate::dto::group::GroupMemberDTO;
    use crate::dto::rule::GroupingRuleDTO;

    fn make_student(id: i64, major_id: i32, major_code: &str) -> GroupMemberDTO {
        GroupMemberDTO {
            id,
            group_id: 0,
            student_id: id,
            roll_number: Some(format!("SE{:06}", id)),
            full_name: Some(format!("Student {}", id)),
            email: Some(format!("student{}@fpt.edu.vn", id)),
            member_code: None,
            cohort: Some("K18".to_string()),
            slot_type: None,
            major_id: Some(major_id),
            major_code: Some(major_code.to_string()),
            major_name: Some("Software Engineering".to_string()),
            role: GroupMemberRole::MEMBER,
            joined_at: None,
            self_description: None,
            match_score: None,
            match_reasons: vec![],
        }
    }

    fn default_test_rules(min_members: i32, max_members: i32) -> Vec<GroupingRuleDTO> {
        vec![
            GroupingRuleDTO {
                code: GroupingRuleCode::MIN_MEMBERS_PER_GROUP,
                value: min_members,
                status: true,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MAX_MEMBERS_PER_GROUP,
                value: max_members,
                status: true,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MIN_GROUPS_PER_CLASS,
                value: 1,
                status: false,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MAX_GROUPS_PER_CLASS,
                value: 50,
                status: false,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MIN_MAJORS_PER_GROUP,
                value: 1,
                status: false,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MAX_MAJORS_PER_GROUP,
                value: 6,
                status: false,
            },
            GroupingRuleDTO {
                code: GroupingRuleCode::MIN_SE_MEMBERS_PER_GROUP,
                value: 0,
                status: false,
            },
        ]
    }

    #[test]
    fn test_preliminary_range_calculation() {
        let students: Vec<GroupMemberDTO> = (1..=20).map(|i| make_student(i, 1, "SE")).collect();
        let rules = default_test_rules(4, 5);

        let snapshot = AllocationSnapshotDTO {
            class_id: 1,
            deadline_id: 1,
            students,
            groups: vec![],
            rules,
        };

        let range = SmartAllocationService::preliminary_range(&snapshot).expect("Valid range");
        assert_eq!(range.minimum, 4);
        assert_eq!(range.maximum, 5);
        assert!(range.has_candidates());
    }

    #[test]
    fn test_smart_allocation_partition() {
        let students: Vec<GroupMemberDTO> = (1..=12)
            .map(|i| {
                make_student(
                    i,
                    if i % 2 == 0 { 1 } else { 2 },
                    if i % 2 == 0 { "SE" } else { "IA" },
                )
            })
            .collect();
        let rules = default_test_rules(4, 6);

        let snapshot = AllocationSnapshotDTO {
            class_id: 1,
            deadline_id: 1,
            students,
            groups: vec![],
            rules,
        };

        let limits = SearchLimits::defaults();
        let result = SmartAllocationService::allocate(&snapshot, 2, 42, limits)
            .expect("Feasible allocation");
        assert_eq!(result.status, AllocationResultStatus::Feasible);
        assert_eq!(result.groups.len(), 2);
        assert_eq!(result.groups[0].members.len(), 6);
        assert_eq!(result.groups[1].members.len(), 6);
    }

    #[test]
    fn test_class_101_suggest() {
        let mut students = Vec::new();
        // 15 SE (major 6), 5 IA (major 8), 5 GD (major 7), 5 AI (major 14)
        for i in 1..=15 {
            students.push(make_student(1100 + i, 6, "SE"));
        }
        for i in 1..=5 {
            students.push(make_student(1115 + i, 8, "IA"));
        }
        for i in 1..=5 {
            students.push(make_student(1120 + i, 7, "GD"));
        }
        for i in 1..=5 {
            students.push(make_student(1125 + i, 14, "AI"));
        }

        let rules = default_test_rules(4, 6);
        let snapshot = AllocationSnapshotDTO {
            class_id: 101,
            deadline_id: 1,
            students,
            groups: vec![],
            rules,
        };

        let suggestion = SmartAllocationService::suggest(&snapshot, 42).expect("Suggestion");
        assert_eq!(suggestion.status, AllocationResultStatus::Feasible);
        assert_eq!(suggestion.suggested_count, Some(6));
    }
}
