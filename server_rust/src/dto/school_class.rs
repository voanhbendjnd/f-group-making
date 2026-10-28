use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolClassDTO {
    pub id: i32,
    pub name: String,
    pub term_id: i32,
    pub term_name: Option<String>,
    pub lecturer_id: Option<i64>,
    pub lecturer_code: Option<String>,
    pub lecturer_name: Option<String>,
    pub lecturer_email: Option<String>,
    pub student_count: i64,
    pub created_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignClassLecturerDTO {
    pub lecturer_id: i64,
    pub expected_lecturer_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolClassQuery {
    pub search: Option<String>,
    pub term_id: Option<i32>,
    pub page: Option<i64>,
    pub size: Option<i64>,
}
