use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::domain::{GroupStatus, GroupingRuleCode};
use crate::dto::group::{GroupDTO, GroupMemberDTO};
use crate::dto::rule::GroupingRuleDTO;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationSnapshotDTO {
    pub class_id: i32,
    pub deadline_id: i32,
    pub students: Vec<GroupMemberDTO>,
    pub groups: Vec<GroupDTO>,
    pub rules: Vec<GroupingRuleDTO>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationPreviewRequest {
    pub target_group_count: i32,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub previous_plan_fingerprint: Option<String>,
}

impl AllocationPreviewRequest {
    pub const MAX_SAFE_SEED: i64 = 9_007_199_254_740_991;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AllocationResultStatus {
    Feasible,
    ProvenInfeasible,
    SearchLimitReached,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AllocationReasonCode {
    TargetMustBePositive,
    TargetBelowProtected,
    NewGroupsNotAllowed,
    MemberCapacity,
    InsufficientMembers,
    InsufficientSe,
    InsufficientMajors,
    ClassGroupBound,
    RuleBoundsConflict,
    NoEditableGroup,
    NoPartition,
    SearchBudgetExhausted,
    SearchDepthLimit,
    ProtectedRuleWarning,
    PreliminaryOnly,
    ValidatedSuggestion,
    NoConfirmedSuggestion,
    SuggestedBalancedSize,
    SuggestedPreservesValidGroups,
    ProtectedCountsIncluded,
    SameAsPreviousPlan,
    BalancedSizeConflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AllocationReason {
    pub code: AllocationReasonCode,
    pub parameters: HashMap<String, i64>,
}

impl AllocationReason {
    pub fn new(code: AllocationReasonCode, actual: i64, required: i64) -> Self {
        let mut parameters = HashMap::new();
        parameters.insert("actual".to_string(), actual);
        parameters.insert("required".to_string(), required);
        Self { code, parameters }
    }

    pub fn with_params(code: AllocationReasonCode, params: &[(&str, i64)]) -> Self {
        let mut parameters = HashMap::new();
        for (k, v) in params {
            parameters.insert(k.to_string(), *v);
        }
        Self { code, parameters }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreliminaryRange {
    pub minimum: i32,
    pub maximum: i32,
    pub protected_groups: i32,
    pub editable_students: i32,
    pub reasons: Vec<AllocationReason>,
}

impl PreliminaryRange {
    pub fn has_candidates(&self) -> bool {
        self.minimum <= self.maximum
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScoreCriterion {
    Members,
    Majors,
    Se,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleScore {
    pub code: GroupingRuleCode,
    pub actual_value: i32,
    pub target_value: i32,
    pub passed: bool,
    pub fulfillment_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CriterionScore {
    pub code: ScoreCriterion,
    pub base_weight: i32,
    pub effective_weight_percent: f64,
    pub fulfillment_percent: f64,
    pub contribution_percent: f64,
    #[serde(default)]
    pub rules: Vec<RuleScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupScoreDTO {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_percent: Option<f64>,
    pub applicable: bool,
    pub composition_rules_passed: bool,
    #[serde(default)]
    pub breakdown: Vec<CriterionScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedGroup {
    pub group_id: Option<i64>,
    pub name: String,
    pub status: GroupStatus,
    pub leader_id: i64,
    pub protected_group: bool,
    pub members: Vec<GroupMemberDTO>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<GroupScoreDTO>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_group_key: Option<String>,
    pub new_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Optimization {
    pub valid_groups_preserved: i32,
    pub leaders_preserved: i32,
    pub moved_students: i32,
    pub compatibility_utility: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckedTarget {
    pub target: i32,
    pub status: AllocationResultStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_count: Option<i32>,
    pub status: AllocationResultStatus,
    pub reasons: Vec<AllocationReason>,
    pub checked_targets: Vec<CheckedTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationResultDTO {
    pub status: AllocationResultStatus,
    pub target_group_count: i32,
    pub seed: i64,
    pub range: PreliminaryRange,
    pub groups: Vec<PlannedGroup>,
    pub disbanded_group_ids: Vec<i64>,
    pub reasons: Vec<AllocationReason>,
    pub visited_nodes: i64,
    pub search_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optimization: Option<Optimization>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuleScope {
    Group,
    Class,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleView {
    pub code: GroupingRuleCode,
    pub scope: RuleScope,
    pub actual_value: i32,
    pub target_value: i32,
    pub passed: bool,
    pub hard_rule: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<i64>,
    pub name: String,
    pub status: GroupStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_name: Option<String>,
    pub protected_group: bool,
    pub members: Vec<GroupMemberDTO>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<GroupScoreDTO>,
    pub rules: Vec<RuleView>,
    pub all_rules_passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_group_key: Option<String>,
    pub new_group: bool,
}

impl GroupView {
    pub fn key(&self) -> String {
        self.plan_group_key
            .clone()
            .unwrap_or_else(|| format!("group:{}", self.group_id.unwrap_or(0)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    pub class_id: i32,
    pub class_name: Option<String>,
    pub term_id: Option<i32>,
    pub lecturer_id: Option<i64>,
    pub rules_version: i64,
    pub deadline_id: i32,
    pub deadline_name: Option<String>,
    pub deadline_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<DateTime<Utc>>,
    pub deadline_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total_students: i32,
    pub total_groups: i32,
    pub unassigned_students: i32,
    pub valid_groups: i32,
    pub invalid_groups: i32,
    pub protected_groups: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartLimits {
    pub maximum_search_nodes: i64,
    pub maximum_search_depth: i32,
    pub creates_new_groups: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary {
    pub status: AllocationResultStatus,
    pub target_group_count: i32,
    pub seed: i64,
    pub range: PreliminaryRange,
    pub warnings: Vec<AllocationReason>,
    pub visited_nodes: i64,
    pub search_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optimization: Option<Optimization>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub student_id: i64,
    pub full_name: Option<String>,
    pub roll_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_group_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_group_name: Option<String>,
    pub previously_unassigned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_group_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderChange {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_leader_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_leader_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_group_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupChange {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<i64>,
    pub name: Option<String>,
    pub protected_group: bool,
    pub disbanded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_before: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_name_before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_after: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_name_after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_before: Option<GroupScoreDTO>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_after: Option<GroupScoreDTO>,
    pub rules_before: Vec<RuleView>,
    pub rules_after: Vec<RuleView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_group_key: Option<String>,
    pub new_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub groups_before: i32,
    pub groups_after: i32,
    pub students_before: i32,
    pub students_after: i32,
    pub unassigned_before: i32,
    pub unassigned_after: i32,
    pub kept_group_ids: Vec<i64>,
    pub disbanded_group_ids: Vec<i64>,
    pub created_group_ids: Vec<i64>,
    pub protected_group_ids: Vec<i64>,
    pub movements: Vec<Movement>,
    pub leader_changes: Vec<LeaderChange>,
    pub group_changes: Vec<GroupChange>,
    #[serde(default)]
    pub created_group_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationPreviewDTO {
    pub scope: Scope,
    pub snapshot_fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_fingerprint: Option<String>,
    pub same_as_previous_plan: bool,
    pub result: SearchSummary,
    pub groups: Vec<GroupView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<Report>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationPreviewOverview {
    pub scope: Scope,
    pub snapshot_fingerprint: String,
    pub summary: Summary,
    pub rules: Vec<GroupingRuleDTO>,
    pub groups: Vec<GroupView>,
    pub unassigned_students: Vec<GroupMemberDTO>,
    pub warnings: Vec<AllocationReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationPreviewSetup {
    pub scope: Scope,
    pub snapshot_fingerprint: String,
    pub seed: i64,
    pub summary: Summary,
    pub range: PreliminaryRange,
    pub suggestion: Suggestion,
    pub limits: SmartLimits,
    pub warnings: Vec<AllocationReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationApplyRequestDTO {
    pub preview_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationApplyDTO {
    pub run_id: Option<i64>,
    pub preview_id: String,
    pub actor_id: i64,
    pub class_id: i32,
    pub deadline_id: i32,
    pub target_group_count: i32,
    pub seed: i64,
    pub applied_at: DateTime<Utc>,
    pub snapshot_fingerprint: String,
    pub plan_fingerprint: String,
    pub approved_group_ids: Vec<i64>,
    pub cancelled_invitation_ids: Vec<i64>,
    pub report: Report,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationHistorySummary {
    pub run_id: i64,
    pub preview_id: String,
    pub actor_id: i64,
    pub target_group_count: i32,
    pub seed: i64,
    pub applied_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlanHistoryStatus {
    Unapplied,
    Applied,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanHistorySummary {
    pub plan_id: String,
    pub actor_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_name: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applied_at: Option<DateTime<Utc>>,
    pub target_group_count: i32,
    pub seed: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_students: Option<i32>,
    pub status: PlanHistoryStatus,
    pub available: bool,
    pub can_apply: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanHistoryDetail {
    pub summary: PlanHistorySummary,
    pub preview: AllocationPreviewDTO,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeCount {
    pub members: i32,
    pub groups: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationRecommendationMetrics {
    pub students: i32,
    pub groups: i32,
    pub size_distribution: Vec<SizeCount>,
    pub size_difference: i32,
    pub same_major_pairs: i64,
    pub even_distribution_lower_bound: i64,
    pub excess_major_pairs: i64,
    pub groups_with_three_plus_same_major: i32,
    pub groups_with_four_plus_same_major: i32,
    pub unknown_major_students: i32,
    pub valid_drafts_preserved: i32,
    pub valid_drafts_before: i32,
    pub leaders_preserved: i32,
    pub leaders_before: i32,
    pub moved_students: i32,
    pub unassigned_allocated: i32,
    pub protected_groups: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_group_score: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AllocationRecommendationReasonCode {
    AllRulesPassed,
    BalancedSizes,
    MajorDistribution,
    MajorConcentrationRemains,
    UnknownMajors,
    ValidDraftsPreserved,
    LeadersPreserved,
    StudentMovements,
    UnassignedAllocated,
    ProtectedUnchanged,
    GroupScore,
    EquivalentPlans,
    SearchNotExhaustive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationRecommendationReason {
    pub code: AllocationRecommendationReasonCode,
    pub parameters: HashMap<String, serde_json::Value>,
}

impl AllocationRecommendationReason {
    pub fn new(
        code: AllocationRecommendationReasonCode,
        params: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            code,
            parameters: params,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationRecommendationDTO {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_group_count: Option<i32>,
    pub eligible_plans: i32,
    pub equivalent_plans: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics: Option<AllocationRecommendationMetrics>,
    pub reasons: Vec<AllocationRecommendationReason>,
}
