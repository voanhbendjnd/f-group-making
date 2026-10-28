use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct CreateLecturerDTO {
    pub code: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LecturerDTO {
    pub user_id: i64,
    pub code: String,
    pub name: Option<String>,
    pub email: String,
    pub activated: bool,
    pub has_activation_key: bool,
    pub activation_key_expires_at: Option<DateTime<Utc>>,
    pub is_key_expired: bool,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LecturerProfileDTO {
    pub name: Option<String>,
    pub code: Option<String>,
    pub email: String,
    pub activated: bool,
    pub profile_complete: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LecturerQuery {
    pub search: Option<String>,
    pub activated: Option<bool>,
    pub has_activation_key: Option<bool>,
    pub term_id: Option<i32>,
    pub page: Option<i64>,
    pub size: Option<i64>,
}
