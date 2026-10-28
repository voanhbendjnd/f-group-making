use sqlx::MySqlPool;
use std::sync::Arc;

use crate::config::AppConfig;
use crate::security::SecurityService;
use crate::service::mail_service::MailService;

pub mod account_handler;
pub mod allocation_handler;
pub mod class_rule_handler;
pub mod deadline_handler;
pub mod group_handler;
pub mod group_review_handler;
pub mod lecturer_handler;
pub mod lecturer_profile_handler;
pub mod major_handler;
pub mod school_class_handler;
pub mod student_handler;
pub mod student_profile_handler;
pub mod term_handler;
pub mod websocket_handler;
pub mod zalo_share_handler;

#[derive(Clone)]
pub struct AppState {
    pub pool: MySqlPool,
    pub config: Arc<AppConfig>,
    pub security: Arc<SecurityService>,
    pub mail_service: MailService,
    pub event_sender: tokio::sync::broadcast::Sender<crate::dto::realtime::GroupRealtimeEvent>,
}

impl AppState {
    pub fn new(pool: MySqlPool, config: Arc<AppConfig>) -> Self {
        let mail_service = MailService::new(Arc::clone(&config));
        let security = Arc::new(SecurityService::new(
            &config.jwt_base64_secret,
            config.jwt_access_token_validity_seconds,
            config.jwt_refresh_token_validity_seconds,
        ));
        let (event_sender, _rx) = tokio::sync::broadcast::channel(1024);
        Self {
            pool,
            config,
            security,
            mail_service,
            event_sender,
        }
    }
}
