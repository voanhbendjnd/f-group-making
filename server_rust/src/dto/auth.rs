use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
pub struct LoginVM {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLogin {
    pub id: i64,
    pub email: String,
    pub name: Option<String>,
    pub authorities: HashSet<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResLoginDTO {
    pub access_token: String,
    #[serde(skip_serializing)]
    pub refresh_token: Option<String>,
    pub user: UserLogin,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivateAccountVM {
    pub key: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResetPasswordInitVM {
    pub email: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyAndPasswordVM {
    pub reset_key: String,
    pub new_password: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MulUserId {
    pub user_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationKeyVerifyDTO {
    pub valid: bool,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetKeyVerifyDTO {
    pub valid: bool,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchActivationResultDTO {
    pub total_requested: usize,
    pub total_processed: usize,
    pub total_skipped_already_active: usize,
    pub sent_emails: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserDTO {
    pub id: Option<i64>,
    pub name: Option<String>,
    pub email: String,
    pub created_by: Option<String>,
    pub created_date: Option<DateTime<Utc>>,
    pub last_modified_by: Option<String>,
    pub last_modified_date: Option<DateTime<Utc>>,
    pub activated: bool,
    pub authorities: Option<HashSet<String>>,
    pub activation_key: Option<String>,
    pub reset_key: Option<String>,
}
