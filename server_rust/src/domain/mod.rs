use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub password_hash: Option<String>,
    pub name: Option<String>,
    pub activated: bool,
    pub activation_key: Option<String>,
    pub activation_key_expires_at: Option<DateTime<Utc>>,
    pub reset_key: Option<String>,
    pub reset_date: Option<DateTime<Utc>>,
    pub session_id: Option<String>,
    pub refresh_token: Option<String>,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Authority {
    pub name: String,
}

pub struct AuthoritiesConstants;
impl AuthoritiesConstants {
    pub const ADMIN: &'static str = "ROLE_ADMIN";
    pub const LECTURE: &'static str = "ROLE_LECTURE";
    pub const LECTURE_MASTER: &'static str = "ROLE_LECTURE_MASTER";
    pub const STUDENT: &'static str = "ROLE_STUDENT";
    pub const ANONYMOUS: &'static str = "ROLE_ANONYMOUS";
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Term {
    pub id: i32,
    pub name: String,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Major {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MajorTerm {
    pub id: i64,
    pub major_id: i32,
    pub term_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SchoolClass {
    pub id: i32,
    pub name: String,
    pub term_id: Option<i32>,
    pub lecturer_id: Option<i64>,
    pub rules_version: i64,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Student {
    pub user_id: i64,
    pub roll_number: String,
    pub full_name: String,
    pub major_id: i32,
    pub member_code: String,
    pub cohort: Option<String>,
    pub slot_type: Option<String>,
    pub school_class_id: Option<i32>,
    pub group_id: Option<i64>,
    pub self_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Lecturer {
    pub user_id: i64,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum DeadlineStatus {
    UNSCHEDULED,
    UPCOMING,
    ACTIVE,
    EXPIRED,
    CANCELLED,
}

impl DeadlineStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UNSCHEDULED => "UNSCHEDULED",
            Self::UPCOMING => "UPCOMING",
            Self::ACTIVE => "ACTIVE",
            Self::EXPIRED => "EXPIRED",
            Self::CANCELLED => "CANCELLED",
        }
    }

    pub fn calculate(
        start: Option<DateTime<Utc>>,
        end: Option<DateTime<Utc>>,
        now: DateTime<Utc>,
    ) -> Self {
        match (start, end) {
            (Some(s), Some(e)) => {
                if now < s {
                    Self::UPCOMING
                } else if now >= e {
                    Self::EXPIRED
                } else {
                    Self::ACTIVE
                }
            }
            _ => Self::UNSCHEDULED,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Deadline {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub status: String,
    pub version: i64,
    pub schedule_revision: i64,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub cancelled_by: Option<String>,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DeadlineClassWindow {
    pub deadline_id: i32,
    pub school_class_id: i32,
    pub end_time_override: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[allow(non_camel_case_types)]
pub enum GroupingRuleCode {
    MIN_MEMBERS_PER_GROUP,
    MAX_MEMBERS_PER_GROUP,
    MIN_GROUPS_PER_CLASS,
    MAX_GROUPS_PER_CLASS,
    MIN_MAJORS_PER_GROUP,
    MAX_MAJORS_PER_GROUP,
    MIN_SE_MEMBERS_PER_GROUP,
}

impl GroupingRuleCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MIN_MEMBERS_PER_GROUP => "MIN_MEMBERS_PER_GROUP",
            Self::MAX_MEMBERS_PER_GROUP => "MAX_MEMBERS_PER_GROUP",
            Self::MIN_GROUPS_PER_CLASS => "MIN_GROUPS_PER_CLASS",
            Self::MAX_GROUPS_PER_CLASS => "MAX_GROUPS_PER_CLASS",
            Self::MIN_MAJORS_PER_GROUP => "MIN_MAJORS_PER_GROUP",
            Self::MAX_MAJORS_PER_GROUP => "MAX_MAJORS_PER_GROUP",
            Self::MIN_SE_MEMBERS_PER_GROUP => "MIN_SE_MEMBERS_PER_GROUP",
        }
    }

    pub fn suggested_value(&self) -> i32 {
        match self {
            Self::MIN_MEMBERS_PER_GROUP => 4,
            Self::MAX_MEMBERS_PER_GROUP => 6,
            Self::MIN_GROUPS_PER_CLASS => 1,
            Self::MAX_GROUPS_PER_CLASS => 50,
            Self::MIN_MAJORS_PER_GROUP => 2,
            Self::MAX_MAJORS_PER_GROUP => 6,
            Self::MIN_SE_MEMBERS_PER_GROUP => 1,
        }
    }

    pub fn minimum_value(&self) -> i32 {
        match self {
            Self::MIN_SE_MEMBERS_PER_GROUP => 0,
            _ => 1,
        }
    }

    pub fn is_enabled_by_default(&self) -> bool {
        !matches!(
            self,
            Self::MIN_GROUPS_PER_CLASS
                | Self::MAX_GROUPS_PER_CLASS
                | Self::MIN_SE_MEMBERS_PER_GROUP
        )
    }

    pub fn all() -> &'static [GroupingRuleCode] {
        &[
            Self::MIN_MEMBERS_PER_GROUP,
            Self::MAX_MEMBERS_PER_GROUP,
            Self::MIN_GROUPS_PER_CLASS,
            Self::MAX_GROUPS_PER_CLASS,
            Self::MIN_MAJORS_PER_GROUP,
            Self::MAX_MAJORS_PER_GROUP,
            Self::MIN_SE_MEMBERS_PER_GROUP,
        ]
    }
}

impl std::str::FromStr for GroupingRuleCode {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "MIN_MEMBERS_PER_GROUP" => Ok(Self::MIN_MEMBERS_PER_GROUP),
            "MAX_MEMBERS_PER_GROUP" => Ok(Self::MAX_MEMBERS_PER_GROUP),
            "MIN_GROUPS_PER_CLASS" => Ok(Self::MIN_GROUPS_PER_CLASS),
            "MAX_GROUPS_PER_CLASS" => Ok(Self::MAX_GROUPS_PER_CLASS),
            "MIN_MAJORS_PER_GROUP" => Ok(Self::MIN_MAJORS_PER_GROUP),
            "MAX_MAJORS_PER_GROUP" => Ok(Self::MAX_MAJORS_PER_GROUP),
            "MIN_SE_MEMBERS_PER_GROUP" => Ok(Self::MIN_SE_MEMBERS_PER_GROUP),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Rule {
    pub id: i32,
    pub code: String,
    pub school_class_id: i32,
    pub value: i32,
    pub status: bool,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum GroupStatus {
    OPEN,
    PENDING,
    ACCEPTED,
    REVOKED,
    DISBANDED,
}

impl GroupStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OPEN => "OPEN",
            Self::PENDING => "PENDING",
            Self::ACCEPTED => "ACCEPTED",
            Self::REVOKED => "REVOKED",
            Self::DISBANDED => "DISBANDED",
        }
    }
}

impl std::str::FromStr for GroupStatus {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "OPEN" => Ok(Self::OPEN),
            "PENDING" => Ok(Self::PENDING),
            "ACCEPTED" => Ok(Self::ACCEPTED),
            "REVOKED" => Ok(Self::REVOKED),
            "DISBANDED" => Ok(Self::DISBANDED),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Group {
    pub id: i64,
    pub deadline_id: i32,
    pub school_class_id: i32,
    pub sequence_no: Option<i32>,
    pub name: String,
    pub leader_id: i64,
    pub status: String,
    pub reject_reason: Option<String>,
    pub submitted_rules_version: Option<i64>,
    pub rules_evaluation_snapshot: Option<String>,
    pub is_lecturer_created: bool,
    pub version: i64,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum GroupMemberRole {
    LEADER,
    MEMBER,
}

impl GroupMemberRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LEADER => "LEADER",
            Self::MEMBER => "MEMBER",
        }
    }
}

impl std::str::FromStr for GroupMemberRole {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "LEADER" => Ok(Self::LEADER),
            "MEMBER" => Ok(Self::MEMBER),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupMember {
    pub id: i64,
    pub group_id: i64,
    pub student_id: i64,
    pub deadline_id: i32,
    pub school_class_id: i32,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum GroupInvitationStatus {
    PENDING,
    ACCEPTED,
    REJECTED,
    CANCELLED,
}

impl GroupInvitationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PENDING => "PENDING",
            Self::ACCEPTED => "ACCEPTED",
            Self::REJECTED => "REJECTED",
            Self::CANCELLED => "CANCELLED",
        }
    }
}

impl std::str::FromStr for GroupInvitationStatus {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "PENDING" => Ok(Self::PENDING),
            "ACCEPTED" => Ok(Self::ACCEPTED),
            "REJECTED" => Ok(Self::REJECTED),
            "CANCELLED" => Ok(Self::CANCELLED),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupInvitation {
    pub id: i64,
    pub group_id: i64,
    pub student_id: i64,
    pub inviter_id: i64,
    pub deadline_id: i32,
    pub school_class_id: i32,
    pub status: String,
    pub message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub responded_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupMemberHistory {
    pub id: i64,
    pub group_id: i64,
    pub student_id: i64,
    pub deadline_id: i32,
    pub action: String,
    pub performed_by: String,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupStatusHistory {
    pub id: i64,
    pub group_id: i64,
    pub from_status: String,
    pub to_status: String,
    pub changed_by: String,
    pub reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GroupRuleOverride {
    pub id: i64,
    pub group_id: i64,
    pub lecturer_username: String,
    pub violated_rules: String,
    pub override_reason: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ZaloShare {
    pub id: i64,
    pub school_class_id: Option<i32>,
    pub lecturer_id: Option<i64>,
    pub term_id: i32,
    pub scope: String,
    pub scope_key: String,
    pub title: String,
    pub invite_url: String,
    pub description: Option<String>,
    pub qr_public_id: Option<String>,
    pub qr_format: Option<String>,
    pub qr_bytes: Option<i64>,
    pub version: i64,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AllocationPreview {
    pub id: String,
    pub owner_id: i64,
    pub school_class_id: i32,
    pub deadline_id: i32,
    pub target_count: i32,
    pub seed: i64,
    pub snapshot_fingerprint: String,
    pub plan_fingerprint: String,
    pub payload: Option<String>,
    pub format_version: i32,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub applied_at: Option<DateTime<Utc>>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AllocationRun {
    pub id: i64,
    pub preview_id: String,
    pub apply_request_id: Option<i64>,
    pub actor_id: i64,
    pub school_class_id: i32,
    pub deadline_id: i32,
    pub target_count: i32,
    pub seed: i64,
    pub applied_at: DateTime<Utc>,
    pub snapshot_fingerprint: String,
    pub plan_fingerprint: String,
    pub result_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AllocationApplyRequest {
    pub id: i64,
    pub owner_id: i64,
    pub school_class_id: i32,
    pub deadline_id: i32,
    pub preview_id: String,
    pub key_hash: String,
    pub request_hash: String,
    pub status: String,
    pub result_json: Option<String>,
    pub failure_code: Option<String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub version: i64,
}
