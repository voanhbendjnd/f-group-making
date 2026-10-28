use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;

use crate::domain::{AllocationPreview, GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::allocation::*;
use crate::dto::group::{GroupDTO, GroupMemberDTO};
use crate::dto::rule::GroupingRuleDTO;
use crate::error::AppError;
use crate::repository::allocation_repository::AllocationPreviewRepository;
use crate::repository::deadline_repository::DeadlineRepository;
use crate::repository::group_member_repository::GroupMemberRepository;
use crate::repository::group_repository::{GroupInvitationRepository, GroupRepository};
use crate::repository::school_class_repository::SchoolClassRepository;
use crate::repository::student_repository::StudentRepository;
use crate::service::deadline_service::DeadlineService;
use crate::service::group_rule_validation_service::GroupRuleValidationService;
use crate::service::group_score_service::GroupScoreService;
use crate::service::smart_allocation_service::{SearchLimits, SmartAllocationService};

pub struct AllocationPreviewService;

#[derive(Debug, Clone)]
pub struct Loaded {
    pub scope: Scope,
    pub snapshot: AllocationSnapshotDTO,
    pub fingerprint: String,
}

#[derive(Debug, Clone)]
pub struct Captured {
    pub overview: AllocationPreviewOverview,
    pub snapshot: AllocationSnapshotDTO,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InvitationState {
    id: i64,
    group_id: i64,
    student_id: i64,
    inviter_id: i64,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FingerprintData<'a> {
    format: &'static str,
    scope: &'a Scope,
    stored_deadline_status: &'a str,
    base_end_time: Option<DateTime<Utc>>,
    rules: &'a [GroupingRuleDTO],
    students: &'a [GroupMemberDTO],
    groups: &'a [GroupDTO],
    invitations: Vec<InvitationState>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Assignment {
    group_id: Option<i64>,
    status: GroupStatus,
    leader_id: Option<i64>,
    members: Vec<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanIdentity<'a> {
    snapshot_fingerprint: &'a str,
    assignments: Vec<Assignment>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannedAssignment {
    key: String,
    group_id: Option<i64>,
    name: String,
    new_group: bool,
    status: GroupStatus,
    leader_id: Option<i64>,
    members: Vec<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanIdentityV2<'a> {
    snapshot_fingerprint: &'a str,
    assignments: Vec<PlannedAssignment>,
}

impl AllocationPreviewService {
    pub async fn overview(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
    ) -> Result<AllocationPreviewOverview, AppError> {
        let loaded = Self::load(pool, user_id, roles, deadline_id, class_id).await?;
        Ok(Self::build_overview(&loaded))
    }

    pub fn is_allocation_complete(overview: &AllocationPreviewOverview) -> bool {
        !overview.groups.is_empty()
            && overview.unassigned_students.is_empty()
            && overview
                .groups
                .iter()
                .all(|g| g.status == GroupStatus::ACCEPTED)
    }

    pub fn require_allocation_needed(overview: &AllocationPreviewOverview) -> Result<(), AppError> {
        if Self::is_allocation_complete(overview) {
            return Err(AppError::conflict(
                "Class allocation is complete",
                "allocation",
                "allocationAlreadyComplete",
            ));
        }
        Ok(())
    }

    pub async fn setup(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
        requested_seed: Option<i64>,
    ) -> Result<AllocationPreviewSetup, AppError> {
        let loaded = Self::load(pool, user_id, roles, deadline_id, class_id).await?;
        let seed = Self::resolve_seed(requested_seed)?;
        let overview = Self::build_overview(&loaded);
        let limits = SearchLimits::defaults();
        let snapshot = loaded.snapshot.clone();
        let (range, suggestion) = tokio::task::spawn_blocking(move || {
            let r = SmartAllocationService::preliminary_range(&snapshot)?;
            let s = SmartAllocationService::suggest(&snapshot, seed)?;
            Ok::<_, AppError>((r, s))
        })
        .await
        .map_err(|e| AppError::Internal(format!("Allocation task panicked: {}", e)))??;

        Ok(AllocationPreviewSetup {
            scope: loaded.scope,
            snapshot_fingerprint: loaded.fingerprint,
            seed,
            summary: overview.summary,
            range,
            suggestion,
            limits: SmartLimits {
                maximum_search_nodes: limits.maximum_nodes,
                maximum_search_depth: limits.maximum_depth as i32,
                creates_new_groups: true,
            },
            warnings: overview.warnings,
        })
    }

    pub async fn preview(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
        request: &AllocationPreviewRequest,
    ) -> Result<AllocationPreviewDTO, AppError> {
        if request.target_group_count < 1 {
            return Err(AppError::bad_request(
                "Positive target required",
                "allocation",
                "targetMustBePositive",
            ));
        }

        let loaded = Self::load(pool, user_id, roles, deadline_id, class_id).await?;
        let seed = Self::resolve_seed(request.seed)?;
        let before = Self::build_overview(&loaded);
        Self::require_allocation_needed(&before)?;

        let limits = SearchLimits::defaults();
        let snapshot = loaded.snapshot.clone();
        let target = request.target_group_count;
        let result = tokio::task::spawn_blocking(move || {
            SmartAllocationService::allocate(&snapshot, target, seed, limits)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Allocation task panicked: {}", e)))??;

        let feasible = result.status == AllocationResultStatus::Feasible;
        let proposed = if feasible {
            let total_groups = result.groups.len() as i32;
            result
                .groups
                .iter()
                .map(|group| {
                    let mut evaluated = Self::view(
                        &loaded.snapshot.rules,
                        group.group_id,
                        &group.name,
                        group.status,
                        Some(group.leader_id),
                        &group.members,
                        total_groups,
                    );
                    evaluated.plan_group_key = group.plan_group_key.clone();
                    evaluated.new_group = group.new_group;
                    evaluated
                })
                .collect()
        } else {
            vec![]
        };

        let plan_fingerprint = if feasible {
            Some(Self::plan_fingerprint(&loaded.fingerprint, &proposed)?)
        } else {
            None
        };

        let same =
            feasible && plan_fingerprint.as_deref() == request.previous_plan_fingerprint.as_deref();

        let mut warnings = before.warnings.clone();
        warnings.extend(result.reasons);
        if same {
            warnings.push(AllocationReason::with_params(
                AllocationReasonCode::SameAsPreviousPlan,
                &[],
            ));
        }

        // Deduplicate warnings
        let mut seen_reasons = HashSet::new();
        warnings.retain(|r| seen_reasons.insert((r.code, format!("{:?}", r.parameters))));

        let search_summary = SearchSummary {
            status: result.status,
            target_group_count: result.target_group_count,
            seed,
            range: result.range,
            warnings,
            visited_nodes: result.visited_nodes,
            search_complete: result.search_complete,
            optimization: result.optimization,
        };

        let report = if feasible {
            Some(Self::generate_report(
                &before,
                &proposed,
                &result.disbanded_group_ids,
            ))
        } else {
            None
        };

        let response = AllocationPreviewDTO {
            scope: loaded.scope.clone(),
            snapshot_fingerprint: loaded.fingerprint.clone(),
            plan_fingerprint: plan_fingerprint.clone(),
            same_as_previous_plan: same,
            result: search_summary,
            groups: proposed,
            report,
            preview_id: None,
            created_at: None,
            expires_at: None,
        };

        if feasible {
            Self::store_preview(pool, user_id, &response).await
        } else {
            Ok(response)
        }
    }

    pub async fn capture(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
    ) -> Result<Captured, AppError> {
        let loaded = Self::load(pool, user_id, roles, deadline_id, class_id).await?;
        let overview = Self::build_overview(&loaded);
        Ok(Captured {
            overview,
            snapshot: loaded.snapshot,
        })
    }

    pub async fn capture_for_history(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
    ) -> Result<Option<Captured>, AppError> {
        match Self::capture(pool, user_id, roles, deadline_id, class_id).await {
            Ok(c) => Ok(Some(c)),
            Err(AppError::Conflict { .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn plan_fingerprint(
        snapshot_fingerprint: &str,
        proposed: &[GroupView],
    ) -> Result<String, AppError> {
        let has_new_or_virtual = proposed
            .iter()
            .any(|g| g.plan_group_key.is_some() || g.new_group);

        if has_new_or_virtual {
            let mut assignments: Vec<PlannedAssignment> = proposed
                .iter()
                .map(|g| {
                    let mut member_ids: Vec<i64> = g.members.iter().map(|m| m.student_id).collect();
                    member_ids.sort();
                    PlannedAssignment {
                        key: g.key(),
                        group_id: g.group_id,
                        name: g.name.clone(),
                        new_group: g.new_group,
                        status: g.status,
                        leader_id: g.leader_id,
                        members: member_ids,
                    }
                })
                .collect();
            assignments.sort_by(|a, b| a.key.cmp(&b.key));

            let payload = PlanIdentityV2 {
                snapshot_fingerprint,
                assignments,
            };
            Self::sha256_json(&payload)
        } else {
            let mut assignments: Vec<Assignment> = proposed
                .iter()
                .map(|g| {
                    let mut member_ids: Vec<i64> = g.members.iter().map(|m| m.student_id).collect();
                    member_ids.sort();
                    Assignment {
                        group_id: g.group_id,
                        status: g.status,
                        leader_id: g.leader_id,
                        members: member_ids,
                    }
                })
                .collect();
            assignments.sort_by_key(|a| a.group_id);

            let payload = PlanIdentity {
                snapshot_fingerprint,
                assignments,
            };
            Self::sha256_json(&payload)
        }
    }

    pub fn resolve_report(mut report: Report, created: &HashMap<String, i64>) -> Report {
        if created.is_empty() {
            return report;
        }

        for m in &mut report.movements {
            if m.to_group_id.is_none() {
                if let Some(key) = &m.to_group_key {
                    m.to_group_id = created.get(key).copied();
                }
            }
        }

        for l in &mut report.leader_changes {
            if l.group_id.is_none() {
                if let Some(key) = &l.plan_group_key {
                    l.group_id = created.get(key).copied();
                }
            }
        }

        for g in &mut report.group_changes {
            if g.group_id.is_none() {
                if let Some(key) = &g.plan_group_key {
                    g.group_id = created.get(key).copied();
                }
            }
        }

        report.created_group_ids = created.values().copied().collect();
        report
    }

    async fn load(
        pool: &MySqlPool,
        user_id: i64,
        roles: &[String],
        deadline_id: i32,
        class_id: i32,
    ) -> Result<Loaded, AppError> {
        if class_id < 1 || deadline_id < 1 {
            return Err(AppError::bad_request(
                "Invalid class/session",
                "allocation",
                "invalidClassOrSession",
            ));
        }

        let school_class = SchoolClassRepository::find_by_id(pool, class_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Class not found", "schoolClass", "classNotFound")
            })?;

        // Authorization: LECTURE or LECTURE_MASTER can only access their own class; ADMIN can access all
        let is_admin = roles.iter().any(|r| r == "ROLE_ADMIN");
        if !is_admin && school_class.lecturer_id != Some(user_id) {
            return Err(AppError::forbidden(
                "You do not have write access to this class",
                "allocation",
                "accessDenied",
            ));
        }

        let deadline = DeadlineRepository::find_by_id(pool, deadline_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Deadline not found", "deadline", "deadlineNotFound")
            })?;

        let belongs =
            DeadlineRepository::count_by_deadline_id_and_class_id(pool, deadline_id, class_id)
                .await?;
        if belongs != 1 {
            return Err(AppError::forbidden(
                "Deadline not in class",
                "allocation",
                "deadlineNotInClass",
            ));
        }

        let all_deadlines = DeadlineRepository::find_all_by_school_class_id(pool, class_id).await?;
        if all_deadlines.len() != 1 {
            return Err(AppError::conflict(
                "Allocation source data is inconsistent; refresh or review memberships/session",
                "allocation",
                "allocationDataConflict",
            ));
        }

        let student_rows =
            StudentRepository::find_students_by_school_class_id(pool, class_id).await?;
        let count_students = StudentRepository::count_by_school_class_id(pool, class_id).await?;
        if count_students as usize != student_rows.len() {
            return Err(AppError::conflict(
                "Student count mismatch",
                "allocation",
                "allocationDataConflict",
            ));
        }

        let mut student_map: BTreeMap<i64, GroupMemberDTO> = BTreeMap::new();
        let mut rows_by_id = HashMap::new();
        for row in &student_rows {
            let dto = GroupMemberDTO {
                id: 0,
                group_id: 0,
                student_id: row.user_id,
                roll_number: Some(row.roll_number.clone()),
                full_name: Some(row.full_name.clone()),
                email: Some(row.email.clone()),
                member_code: row.member_code.clone(),
                cohort: row.cohort.clone(),
                slot_type: row.slot_type.clone(),
                major_id: row.major_id,
                major_code: row.major_code.clone(),
                major_name: row.major_name.clone(),
                role: GroupMemberRole::MEMBER,
                joined_at: None,
                self_description: row.self_description.clone(),
                match_score: None,
                match_reasons: vec![],
            };

            if student_map.insert(row.user_id, dto).is_some() {
                return Err(AppError::conflict(
                    "Duplicate student row",
                    "allocation",
                    "allocationDataConflict",
                ));
            }
            rows_by_id.insert(row.user_id, row);
        }

        let mut stored_groups =
            GroupRepository::find_by_school_class_id_and_deadline_id(pool, class_id, deadline_id)
                .await?;
        stored_groups.sort_by_key(|g| g.id);

        let group_ids: Vec<i64> = stored_groups.iter().map(|g| g.id).collect();
        let student_ids: Vec<i64> = student_map.keys().copied().collect();

        let member_rows = GroupMemberRepository::find_allocation_memberships(
            pool,
            class_id,
            deadline_id,
            &group_ids,
            &student_ids,
        )
        .await?;

        let group_id_set: HashSet<i64> = group_ids.iter().copied().collect();
        let mut by_group: HashMap<i64, Vec<GroupMemberDTO>> = HashMap::new();

        for member in member_rows {
            if member.school_class_id != class_id
                || member.deadline_id != deadline_id
                || !group_id_set.contains(&member.group_id)
                || !student_map.contains_key(&member.student_id)
            {
                return Err(AppError::conflict(
                    "Mis-scoped group membership",
                    "allocation",
                    "allocationDataConflict",
                ));
            }

            let s_row = rows_by_id[&member.student_id];
            let role = match member.role.as_str() {
                "LEADER" => GroupMemberRole::LEADER,
                _ => GroupMemberRole::MEMBER,
            };

            let dto = GroupMemberDTO {
                id: member.id,
                group_id: member.group_id,
                student_id: member.student_id,
                roll_number: Some(s_row.roll_number.clone()),
                full_name: Some(s_row.full_name.clone()),
                email: Some(s_row.email.clone()),
                member_code: s_row.member_code.clone(),
                cohort: s_row.cohort.clone(),
                slot_type: s_row.slot_type.clone(),
                major_id: s_row.major_id,
                major_code: s_row.major_code.clone(),
                major_name: s_row.major_name.clone(),
                role,
                joined_at: Some(member.joined_at),
                self_description: s_row.self_description.clone(),
                match_score: None,
                match_reasons: vec![],
            };

            by_group.entry(member.group_id).or_default().push(dto);
        }

        let group_dtos: Vec<GroupDTO> = stored_groups
            .into_iter()
            .map(|g| {
                let mut members = by_group.remove(&g.id).unwrap_or_default();
                members.sort_by_key(|m| m.student_id);

                let status = match g.status.as_str() {
                    "PENDING" => GroupStatus::PENDING,
                    "ACCEPTED" => GroupStatus::ACCEPTED,
                    "REVOKED" => GroupStatus::REVOKED,
                    "DISBANDED" => GroupStatus::DISBANDED,
                    _ => GroupStatus::OPEN,
                };

                let leader_name = members
                    .iter()
                    .find(|m| m.student_id == g.leader_id)
                    .and_then(|m| m.full_name.clone());

                GroupDTO {
                    id: g.id,
                    deadline_id: g.deadline_id,
                    school_class_id: g.school_class_id,
                    sequence_no: g.sequence_no,
                    name: g.name,
                    leader_id: g.leader_id,
                    leader_name,
                    status,
                    member_count: members.len(),
                    max_members: 0,
                    reject_reason: g.reject_reason,
                    submitted_rules_version: g.submitted_rules_version,
                    is_lecturer_created: Some(g.is_lecturer_created),
                    version: g.version,
                    created_date: g.created_date,
                    members,
                    rule_evaluations: vec![],
                    all_rules_passed: false,
                    has_hard_rule_violations: false,
                    group_code: GroupDTO::compute_group_code(g.sequence_no),
                }
            })
            .collect();

        let rules = GroupRuleValidationService::get_class_rules(pool, class_id).await?;
        let snapshot_students: Vec<GroupMemberDTO> = student_map.into_values().collect();

        let snapshot = AllocationSnapshotDTO {
            class_id,
            deadline_id,
            students: snapshot_students,
            groups: group_dtos,
            rules: rules.clone(),
        };

        // Structural validation
        if let Err(e) = SmartAllocationService::preliminary_range(&snapshot) {
            return Err(AppError::conflict(
                format!("Snapshot validation conflict: {e}"),
                "allocation",
                "allocationDataConflict",
            ));
        }

        let deadline_status = DeadlineService::resolve_deadline_status_for_class(
            pool,
            &deadline,
            class_id,
            Utc::now(),
        )
        .await;

        let window = DeadlineService::resolve_class_window(&deadline, class_id, pool).await;

        let scope = Scope {
            class_id,
            class_name: Some(school_class.name),
            term_id: school_class.term_id,
            lecturer_id: school_class.lecturer_id,
            rules_version: school_class.rules_version,
            deadline_id,
            deadline_name: Some(deadline.name.clone()),
            deadline_status: format!("{:?}", deadline_status).to_uppercase(),
            start_time: window.0,
            end_time: window.1,
            deadline_version: deadline.version,
        };

        let mut pending_invitations =
            GroupInvitationRepository::find_by_school_class_id_and_deadline_id_and_status(
                pool,
                class_id,
                deadline_id,
                "PENDING",
            )
            .await?;
        pending_invitations.sort_by_key(|inv| inv.id);

        let invitation_states: Vec<InvitationState> = pending_invitations
            .into_iter()
            .map(|inv| InvitationState {
                id: inv.id,
                group_id: inv.group_id,
                student_id: inv.student_id,
                inviter_id: inv.inviter_id,
                created_at: inv.created_at,
            })
            .collect();

        let fingerprint_data = FingerprintData {
            format: "allocation-snapshot-v2",
            scope: &scope,
            stored_deadline_status: &deadline.status,
            base_end_time: deadline.end_time,
            rules: &rules,
            students: &snapshot.students,
            groups: &snapshot.groups,
            invitations: invitation_states,
        };

        let fingerprint = Self::sha256_json(&fingerprint_data)?;

        Ok(Loaded {
            scope,
            snapshot,
            fingerprint,
        })
    }

    fn build_overview(loaded: &Loaded) -> AllocationPreviewOverview {
        let snapshot = &loaded.snapshot;
        let active_groups: Vec<&GroupDTO> = snapshot
            .groups
            .iter()
            .filter(|g| g.status != GroupStatus::DISBANDED)
            .collect();

        let total_active = active_groups.len() as i32;
        let views: Vec<GroupView> = active_groups
            .iter()
            .map(|g| {
                Self::view(
                    &snapshot.rules,
                    Some(g.id),
                    &g.name,
                    g.status,
                    Some(g.leader_id),
                    &g.members,
                    total_active,
                )
            })
            .collect();

        let assigned: HashSet<i64> = active_groups
            .iter()
            .flat_map(|g| g.members.iter().map(|m| m.student_id))
            .collect();

        let unassigned: Vec<GroupMemberDTO> = snapshot
            .students
            .iter()
            .filter(|s| !assigned.contains(&s.student_id))
            .cloned()
            .collect();

        let valid = views.iter().filter(|v| v.all_rules_passed).count() as i32;
        let fixed = views.iter().filter(|v| v.protected_group).count() as i32;

        let warnings: Vec<AllocationReason> = views
            .iter()
            .filter(|v| v.protected_group && !v.all_rules_passed)
            .map(|v| {
                AllocationReason::new(
                    AllocationReasonCode::ProtectedRuleWarning,
                    v.group_id.unwrap_or(0),
                    0,
                )
            })
            .collect();

        let summary = Summary {
            total_students: snapshot.students.len() as i32,
            total_groups: total_active,
            unassigned_students: unassigned.len() as i32,
            valid_groups: valid,
            invalid_groups: total_active - valid,
            protected_groups: fixed,
        };

        AllocationPreviewOverview {
            scope: loaded.scope.clone(),
            snapshot_fingerprint: loaded.fingerprint.clone(),
            summary,
            rules: snapshot.rules.clone(),
            groups: views,
            unassigned_students: unassigned,
            warnings,
        }
    }

    fn view(
        rules: &[GroupingRuleDTO],
        id: Option<i64>,
        name: &str,
        status: GroupStatus,
        leader: Option<i64>,
        members: &[GroupMemberDTO],
        group_count: i32,
    ) -> GroupView {
        let group_evals = GroupRuleValidationService::evaluate_rules(rules, members);
        let mut evaluations: Vec<RuleView> = group_evals
            .iter()
            .map(|r| RuleView {
                code: r.code.clone(),
                scope: RuleScope::Group,
                actual_value: r.actual_value,
                target_value: r.target_value,
                passed: r.passed,
                hard_rule: r.hard_rule,
            })
            .collect();

        for rule in rules {
            if rule.status
                && (rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS
                    || rule.code == GroupingRuleCode::MAX_GROUPS_PER_CLASS)
            {
                let passed = if rule.code == GroupingRuleCode::MIN_GROUPS_PER_CLASS {
                    group_count >= rule.value
                } else {
                    group_count <= rule.value
                };
                evaluations.push(RuleView {
                    code: rule.code.clone(),
                    scope: RuleScope::Class,
                    actual_value: group_count,
                    target_value: rule.value,
                    passed,
                    hard_rule: false,
                });
            }
        }

        let leader_name = leader.and_then(|lid| {
            members
                .iter()
                .find(|m| m.student_id == lid)
                .and_then(|m| m.full_name.clone())
        });

        let protected_group = status == GroupStatus::PENDING || status == GroupStatus::ACCEPTED;
        let all_rules_passed = evaluations.iter().all(|r| r.passed);
        let score = GroupScoreService::evaluate_rules(rules, members);

        GroupView {
            group_id: id,
            name: name.to_string(),
            status,
            leader_id: leader,
            leader_name,
            protected_group,
            members: members.to_vec(),
            score: Some(score),
            rules: evaluations,
            all_rules_passed,
            plan_group_key: None,
            new_group: false,
        }
    }

    fn generate_report(
        before: &AllocationPreviewOverview,
        after: &[GroupView],
        disbanded: &[i64],
    ) -> Report {
        let original: HashMap<i64, &GroupView> = before
            .groups
            .iter()
            .filter_map(|g| g.group_id.map(|id| (id, g)))
            .collect();

        let proposed: HashMap<i64, &GroupView> = after
            .iter()
            .filter_map(|g| g.group_id.map(|id| (id, g)))
            .collect();

        let mut origins: HashMap<i64, &GroupView> = HashMap::new();
        for group in &before.groups {
            for m in &group.members {
                origins.insert(m.student_id, group);
            }
        }

        let mut movements = Vec::new();
        let mut leaders = Vec::new();

        for group in after {
            let old = group.group_id.and_then(|id| original.get(&id).copied());
            if old.is_none() || old.unwrap().leader_id != group.leader_id {
                leaders.push(LeaderChange {
                    group_id: group.group_id,
                    previous_leader_id: old.and_then(|o| o.leader_id),
                    previous_leader_name: old.and_then(|o| o.leader_name.clone()),
                    leader_id: group.leader_id,
                    leader_name: group.leader_name.clone(),
                    plan_group_key: Some(group.key()),
                });
            }

            for member in &group.members {
                let from = origins.get(&member.student_id).copied();
                if from.is_none() || from.unwrap().group_id != group.group_id {
                    movements.push(Movement {
                        student_id: member.student_id,
                        full_name: member.full_name.clone(),
                        roll_number: member.roll_number.clone(),
                        from_group_id: from.and_then(|f| f.group_id),
                        from_group_name: from.map(|f| f.name.clone()),
                        to_group_id: group.group_id,
                        to_group_name: Some(group.name.clone()),
                        previously_unassigned: from.is_none(),
                        to_group_key: Some(group.key()),
                    });
                }
            }
        }

        let mut changes = Vec::new();
        for old in &before.groups {
            let updated = old.group_id.and_then(|id| proposed.get(&id).copied());
            changes.push(GroupChange {
                group_id: old.group_id,
                name: Some(old.name.clone()),
                protected_group: old.protected_group,
                disbanded: updated.is_none(),
                leader_before: old.leader_id,
                leader_name_before: old.leader_name.clone(),
                leader_after: updated.and_then(|u| u.leader_id),
                leader_name_after: updated.and_then(|u| u.leader_name.clone()),
                score_before: old.score.clone(),
                score_after: updated.and_then(|u| u.score.clone()),
                rules_before: old.rules.clone(),
                rules_after: updated.map(|u| u.rules.clone()).unwrap_or_default(),
                plan_group_key: None,
                new_group: false,
            });
        }

        for group in after {
            if group.new_group {
                changes.push(GroupChange {
                    group_id: None,
                    name: Some(group.name.clone()),
                    protected_group: false,
                    disbanded: false,
                    leader_before: None,
                    leader_name_before: None,
                    leader_after: group.leader_id,
                    leader_name_after: group.leader_name.clone(),
                    score_before: None,
                    score_after: group.score.clone(),
                    rules_before: vec![],
                    rules_after: group.rules.clone(),
                    plan_group_key: Some(group.key()),
                    new_group: true,
                });
            }
        }

        let kept_ids: Vec<i64> = after
            .iter()
            .filter(|g| !g.new_group)
            .filter_map(|g| g.group_id)
            .collect();
        let protected_ids: Vec<i64> = after
            .iter()
            .filter(|g| g.protected_group)
            .filter_map(|g| g.group_id)
            .collect();
        let created_keys: Vec<String> = after
            .iter()
            .filter(|g| g.new_group)
            .map(|g| g.key())
            .collect();
        let students_after: i32 = after.iter().map(|g| g.members.len() as i32).sum();

        Report {
            groups_before: before.summary.total_groups,
            groups_after: after.len() as i32,
            students_before: before.summary.total_students,
            students_after,
            unassigned_before: before.summary.unassigned_students,
            unassigned_after: 0,
            kept_group_ids: kept_ids,
            disbanded_group_ids: disbanded.to_vec(),
            created_group_ids: vec![],
            protected_group_ids: protected_ids,
            movements,
            leader_changes: leaders,
            group_changes: changes,
            created_group_keys: created_keys,
        }
    }

    async fn store_preview(
        pool: &MySqlPool,
        user_id: i64,
        result: &AllocationPreviewDTO,
    ) -> Result<AllocationPreviewDTO, AppError> {
        let preview_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let expires_at = now + Duration::minutes(15);
        let payload = serde_json::to_string(result)
            .map_err(|e| AppError::Internal(format!("Failed to serialize preview: {e}")))?;

        let row = AllocationPreview {
            id: preview_id.clone(),
            owner_id: user_id,
            school_class_id: result.scope.class_id,
            deadline_id: result.scope.deadline_id,
            target_count: result.result.target_group_count,
            seed: result.result.seed,
            snapshot_fingerprint: result.snapshot_fingerprint.clone(),
            plan_fingerprint: result.plan_fingerprint.clone().unwrap_or_default(),
            payload: Some(payload),
            format_version: 2,
            created_at: now,
            expires_at,
            applied_at: None,
            version: 0,
        };

        AllocationPreviewRepository::save(pool, &row).await?;

        let mut stored = result.clone();
        stored.preview_id = Some(preview_id);
        stored.created_at = Some(now);
        stored.expires_at = None;
        Ok(stored)
    }

    fn resolve_seed(requested: Option<i64>) -> Result<i64, AppError> {
        match requested {
            Some(seed) => {
                if !(-AllocationPreviewRequest::MAX_SAFE_SEED
                    ..=AllocationPreviewRequest::MAX_SAFE_SEED)
                    .contains(&seed)
                {
                    return Err(AppError::bad_request(
                        "Seed must be a JavaScript-safe integer",
                        "allocation",
                        "invalidSeed",
                    ));
                }
                Ok(seed)
            }
            None => {
                let mut rng = rand::thread_rng();
                Ok(rng.gen_range(0..=AllocationPreviewRequest::MAX_SAFE_SEED))
            }
        }
    }

    fn sha256_json<T: Serialize>(value: &T) -> Result<String, AppError> {
        let json = serde_json::to_string(value)
            .map_err(|e| AppError::Internal(format!("Failed to serialize for hash: {e}")))?;
        let mut hasher = Sha256::new();
        hasher.update(json.as_bytes());
        Ok(hex::encode(hasher.finalize()))
    }
}
