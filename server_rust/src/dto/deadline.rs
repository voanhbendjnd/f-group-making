use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::DeadlineStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadlineClassDTO {
    pub school_class_id: i32,
    pub school_class_name: String,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub status: DeadlineStatus,
    pub can_edit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeadlineDTO {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub status: Option<DeadlineStatus>,
    pub version: i64,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub cancelled_by: Option<String>,
    pub can_edit: bool,
    pub can_cancel: bool,
    pub can_close: bool,
    pub mixed_class_windows: bool,
    pub class_windows: Vec<DeadlineClassDTO>,
    pub school_class_ids: Vec<i32>,
    pub school_class_names: Vec<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub created_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDeadlineDTO {
    pub name: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub school_class_ids: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeadlineDTO {
    pub id: Option<i32>,
    pub name: String,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: DateTime<Utc>,
    pub school_class_ids: Option<Vec<i32>>,
    pub confirmed_class_ids: Option<Vec<i32>>,
    pub scope: Option<String>, // "ALL" or "SELECTED"
    pub target_class_ids: Option<Vec<i32>>,
    pub expected_version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeadlineValidateDTO {
    pub valid: bool,
    pub status: Option<DeadlineStatus>,
    pub deadline_id: i32,
    pub name: String,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub class_id: i32,
    pub class_name: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StudentDeadlineActivityDTO {
    pub deadline_id: i32,
    pub deadline_name: String,
    pub deadline_description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub status: Option<DeadlineStatus>,
    pub school_class_id: i32,
    pub school_class_name: String,
    pub has_group: bool,
    pub group_id: Option<i64>,
    pub group_name: Option<String>,
    pub group_status: Option<String>,
    pub member_count: Option<i32>,
    pub max_members: Option<i32>,
    #[serde(rename = "isLeader")]
    pub is_leader: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloseDeadlineDTO {
    pub confirmed_class_ids: Option<Vec<i32>>,
    pub expected_version: Option<i64>,
}
