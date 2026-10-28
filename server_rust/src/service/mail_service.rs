use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::sync::Arc;
use tracing::{debug, error, warn};

use crate::config::AppConfig;
use crate::dto::UserDTO;

#[derive(Clone)]
pub struct MailService {
    config: Arc<AppConfig>,
}

impl MailService {
    pub fn new(config: Arc<AppConfig>) -> Self {
        Self { config }
    }

    pub fn client_base_url(&self) -> &str {
        &self.config.client_base_url
    }

    pub async fn send_email(&self, to: String, subject: String, html_content: String) {
        let config = Arc::clone(&self.config);
        tokio::spawn(async move {
            let from_addr = match config.smtp_from.parse() {
                Ok(addr) => addr,
                Err(e) => {
                    error!("Invalid smtp_from address '{}': {e}", config.smtp_from);
                    return;
                }
            };

            let to_addr = match to.parse() {
                Ok(addr) => addr,
                Err(e) => {
                    warn!("Invalid recipient address '{to}': {e}");
                    return;
                }
            };

            let email = match Message::builder()
                .from(from_addr)
                .to(to_addr)
                .subject(subject)
                .header(ContentType::TEXT_HTML)
                .body(html_content)
            {
                Ok(msg) => msg,
                Err(e) => {
                    error!("Failed to build email message: {e}");
                    return;
                }
            };

            let transport_builder = if config.smtp_starttls {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            } else {
                Ok(AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(
                    &config.smtp_host,
                ))
            };

            let mut transport_builder = match transport_builder {
                Ok(b) => b.port(config.smtp_port),
                Err(e) => {
                    error!("Failed to initialize SMTP transport builder: {e}");
                    return;
                }
            };

            if let (Some(u), Some(p)) = (&config.smtp_username, &config.smtp_password) {
                transport_builder =
                    transport_builder.credentials(Credentials::new(u.clone(), p.clone()));
            }

            let transport = transport_builder.build();

            match transport.send(email).await {
                Ok(_) => debug!("Sent email to '{to}' successfully"),
                Err(e) => warn!("Email could not be sent to user '{to}': {e}"),
            }
        });
    }

    pub async fn send_activation_email(&self, user: &UserDTO) {
        if user.email.is_empty() {
            return;
        }
        let activation_key = user.activation_key.as_deref().unwrap_or("");
        let url = format!(
            "{}/account/activate?key={}",
            self.config.client_base_url, activation_key
        );
        let subject = "F Group Making activation".to_string();
        let html_content = format!(
            r#"<!doctype html>
<html>
<head>
    <title>F Group Making activation</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body>
<p>Dear {},</p>
<p>Your F Group Making account has been created, please click on the URL below to activate it:</p>
<p><a href="{}">{}</a></p>
<p>Regards,<br /><em>F Group Making team.</em></p>
</body>
</html>"#,
            user.email, url, url
        );

        self.send_email(user.email.clone(), subject, html_content)
            .await;
    }

    pub async fn send_password_reset_mail(&self, user: &UserDTO) {
        if user.email.is_empty() {
            return;
        }
        let reset_key = user.reset_key.as_deref().unwrap_or("");
        let url = format!(
            "{}/account/reset/finish?key={}",
            self.config.client_base_url, reset_key
        );
        let subject = "F Group Making password reset".to_string();
        let html_content = format!(
            r#"<!doctype html>
<html>
<head>
    <title>F Group Making password reset</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body>
<p>Dear {},</p>
<p>For your F Group Making account a password reset was requested, please click on the URL below to reset it:</p>
<p><a href="{}">{}</a></p>
<p>Regards,<br /><em>F Group Making.</em></p>
</body>
</html>"#,
            user.email, url, url
        );

        self.send_email(user.email.clone(), subject, html_content)
            .await;
    }
}
