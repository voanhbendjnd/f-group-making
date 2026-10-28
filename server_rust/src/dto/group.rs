use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::{GroupInvitationStatus, GroupMemberRole, GroupStatus, GroupingRuleCode};
use crate::dto::rule::GroupingRuleDTO;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupDTO {
    pub id: i64,
    pub deadline_id: i32,
    pub school_class_id: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence_no: Option<i32>,
    pub name: String,
    pub leader_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader_name: Option<String>,
    pub status: GroupStatus,
    pub member_count: usize,
    pub max_members: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reject_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submitted_rules_version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_lecturer_created: Option<bool>,
    pub version: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub members: Vec<GroupMemberDTO>,
    #[serde(default)]
    pub rule_evaluations: Vec<GroupRuleEvaluationDTO>,
    pub all_rules_passed: bool,
    pub has_hard_rule_violations: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_code: Option<String>,
}

impl GroupDTO {
    pub fn compute_group_code(sequence_no: Option<i32>) -> Option<String> {
        sequence_no.map(|seq| format!("G{:02}", seq))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMemberDTO {
    pub id: i64,
    pub group_id: i64,
    pub student_id: i64,
    pub roll_number: Option<String>,
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub member_code: Option<String>,
    pub cohort: Option<String>,
    pub slot_type: Option<String>,
    pub major_id: Option<i32>,
    pub major_code: Option<String>,
    pub major_name: Option<String>,
    pub role: GroupMemberRole,
    pub joined_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_score: Option<i32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub match_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRuleEvaluationDTO {
    pub code: GroupingRuleCode,
    pub rule_name: String,
    pub hard_rule: bool,
    pub target_value: i32,
    pub actual_value: i32,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDTO {
    pub deadline_id: i32,
    pub deadline_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline_description: Option<String>,
    pub deadline_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline_start_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline_end_time: Option<DateTime<Utc>>,
    pub deadline_expired: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_only_reason: Option<String>,
    pub can_manage_groups: bool,

    pub school_class_id: i32,
    pub school_class_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lecturer_id: Option<i64>,
    pub rules_version: i64,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_group: Option<GroupDTO>,
    #[serde(rename = "isLeader")]
    pub is_leader: bool,

    #[serde(default)]
    pub groups: Vec<GroupDTO>,
    #[serde(default)]
    pub unassigned_students: Vec<GroupMemberDTO>,
    #[serde(default)]
    pub rules: Vec<GroupingRuleDTO>,

    pub can_create_group: bool,
    pub can_join_group: bool,
    #[serde(rename = "isLecturer")]
    pub is_lecturer: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRecommendationDTO {
    pub group_id: i64,
    pub group_name: String,
    pub current_members: usize,
    pub max_members: i32,
    pub match_score: i32,
    #[serde(default)]
    pub match_reasons: Vec<String>,
    pub is_eligible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInvitationDTO {
    pub id: i64,
    pub group_id: i64,
    pub group_name: String,
    pub student_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_roll_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_major_code: Option<String>,
    pub inviter_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inviter_name: Option<String>,
    pub deadline_id: i32,
    pub school_class_id: i32,
    pub status: GroupInvitationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub responded_at: Option<DateTime<Utc>>,
    pub current_members: usize,
    pub max_members: i32,
    #[serde(default)]
    pub match_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentSearchForInviteDTO {
    pub student_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roll_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub major_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub major_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub major_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_description: Option<String>,
    pub has_group: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_group_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_group_name: Option<String>,
    pub can_invite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_violation_reason: Option<String>,
    pub has_pending_invitation: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_invitation_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupReviewDTO {
    pub group: GroupDTO,
    pub class_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submitted_at: Option<DateTime<Utc>>,
    pub deadline_status: String,
    pub eligible: bool,
    pub can_review: bool,
    pub can_reopen: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGroupRequest {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LecturerCreateGroupRequest {
    pub name: String,
    pub student_ids: Vec<i64>,
    pub override_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferLeaderRequest {
    pub new_leader_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectGroupRequest {
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInvitationRequest {
    pub student_id: Option<i64>,
    pub email: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZaloShareDTO {
    pub id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lecturer_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lecturer_name: Option<String>,
    pub term_id: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub term_name: Option<String>,
    pub scope: String,
    pub title: String,
    pub invite_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub has_qr: bool,
    pub version: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZaloShareWriteRequest {
    pub scope: String,
    pub title: String,
    pub invite_url: String,
    pub description: Option<String>,
    pub version: Option<i64>,
    #[serde(default)]
    pub remove_qr: bool,
}
