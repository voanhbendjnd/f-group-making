use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentDTO {
    pub user_id: i64,
    pub roll_number: String,
    pub full_name: String,
    pub email: String,
    pub member_code: Option<String>,
    pub cohort: Option<String>,
    pub slot_type: Option<String>,
    pub major_id: Option<i32>,
    pub major_code: Option<String>,
    pub major_name: Option<String>,
    pub school_class_id: Option<i32>,
    pub group_name: Option<String>,
    pub activated: bool,
    pub has_activation_key: bool,
    pub activation_key_expires_at: Option<DateTime<Utc>>,
    pub is_key_expired: bool,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_date: Option<DateTime<Utc>>,
    pub lecturer_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStudentDTO {
    pub full_name: String,
    pub roll_number: String,
    pub member_code: String,
    pub email: String,
    pub major_id: i32,
    pub term_id: i32,
    pub school_class_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowErrorDTO {
    pub row: usize,
    pub roll_number: Option<String>,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDTO {
    pub success: bool,
    pub total_imported: usize,
    pub errors: Vec<ImportRowErrorDTO>,
    pub confirmation_required: bool,
    pub new_major_codes: Vec<String>,
    pub created_major_codes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StudentQuery {
    pub search: Option<String>,
    pub major_code: Option<String>,
    pub major_search: Option<String>,
    pub major_id: Option<i32>,
    pub activated: Option<bool>,
    pub has_activation_key: Option<bool>,
    pub term_id: Option<i32>,
    pub school_class_id: Option<i32>,
    pub page: Option<i64>,
    pub size: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StudentActivateAllQuery {
    pub search: Option<String>,
    pub major_code: Option<String>,
    pub major_search: Option<String>,
    pub major_id: Option<i32>,
    pub term_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInfo {
    pub name: Option<String>,
    pub state: String, // "AVAILABLE", "UNASSIGNED", "MISSING"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentProfileDTO {
    pub full_name: String,
    pub roll_number: String,
    pub email: String,
    pub activated: bool,
    pub major: ProfileInfo,
    pub school_class: ProfileInfo,
    pub term: ProfileInfo,
    pub group: ProfileInfo,
    pub school_class_id: Option<i32>,
    pub self_description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateStudentBioRequest {
    pub bio: Option<String>,
}
