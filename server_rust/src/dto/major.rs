use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MajorDTO {
    pub id: Option<i32>,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MajorQuery {
    pub search: Option<String>,
    pub temporary_name: Option<bool>,
    pub page: Option<i64>,
    pub size: Option<i64>,
    pub sort: Option<Vec<String>>,
}
