use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRealtimeEvent {
    pub event_id: String,
    pub event_type: String,
    pub group_id: Option<i64>,
    pub deadline_id: Option<i32>,
    pub school_class_id: Option<i32>,
    pub actor: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub payload: serde_json::Value,
}
