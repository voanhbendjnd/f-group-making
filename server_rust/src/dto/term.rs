use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermDTO {
    pub id: i32,
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTermRequestDTO {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermQuery {
    pub current_and_future_only: Option<bool>,
}
