use serde::{Deserialize, Serialize};

use crate::domain::GroupingRuleCode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupingRuleDTO {
    pub code: GroupingRuleCode,
    pub value: i32,
    pub status: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassRulesDTO {
    pub school_class_id: i32,
    pub version: i64,
    pub configured: bool,
    pub rules: Vec<GroupingRuleDTO>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveClassRulesDTO {
    pub version: i64,
    pub rules: Vec<GroupingRuleDTO>,
}
