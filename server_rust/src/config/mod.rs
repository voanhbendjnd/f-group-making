use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
use std::env;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub server_port: u16,
    pub server_host: String,
    pub app_name: String,
    pub database_url: String,
    pub database_max_connections: u32,
    pub database_min_connections: u32,
    pub jwt_base64_secret: String,
    pub jwt_access_token_validity_seconds: u64,
    pub jwt_refresh_token_validity_seconds: u64,
    pub client_base_url: String,
    pub client_allow_localhost: bool,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from: String,
    pub smtp_starttls: bool,
    pub cloudinary_name: Option<String>,
    pub cloudinary_key: Option<String>,
    pub cloudinary_secret: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let server_port = env::var("SERVER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse::<u16>()
            .expect("SERVER_PORT must be a valid u16");

        let server_host = env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let app_name = env::var("APP_NAME").unwrap_or_else(|_| "djnd-fgroup-making".to_string());

        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "mysql://root:1607@localhost:3307/fgroup-making".to_string());

        let database_max_connections = env::var("DATABASE_MAX_CONNECTIONS")
            .unwrap_or_else(|_| "20".to_string())
            .parse::<u32>()
            .unwrap_or(20);

        let database_min_connections = env::var("DATABASE_MIN_CONNECTIONS")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<u32>()
            .unwrap_or(5);

        let jwt_base64_secret = env::var("JWT_BASE64_SECRET")
            .unwrap_or_else(|_| "nE6Od1T/x2GDldpDXhd9uaXfQupvYU7fCgO4IXPG3B2on76ZvM9hmGT7CR4sOPZmVu8R7u4+Uwy9Zik+fOwq9A==".to_string());

        let jwt_access_token_validity_seconds = env::var("JWT_ACCESS_TOKEN_VALIDITY_SECONDS")
            .unwrap_or_else(|_| "604800".to_string())
            .parse::<u64>()
            .unwrap_or(604800);

        let jwt_refresh_token_validity_seconds = env::var("JWT_REFRESH_TOKEN_VALIDITY_SECONDS")
            .unwrap_or_else(|_| "1296000".to_string())
            .parse::<u64>()
            .unwrap_or(1296000);

        let client_base_url =
            env::var("CLIENT_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
        let client_allow_localhost = env::var("CLIENT_ALLOW_LOCALHOST")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .unwrap_or(true);

        let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".to_string());
        let smtp_port = env::var("SMTP_PORT")
            .unwrap_or_else(|_| "1025".to_string())
            .parse::<u16>()
            .unwrap_or(1025);

        let smtp_username = env::var("SMTP_USERNAME")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let smtp_password = env::var("SMTP_PASSWORD")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let smtp_from =
            env::var("SMTP_FROM").unwrap_or_else(|_| "no-reply@fgroup.local".to_string());
        let smtp_starttls = env::var("SMTP_STARTTLS")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .unwrap_or(false);

        let cloudinary_name = env::var("CLOUDINARY_NAME")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let cloudinary_key = env::var("CLOUDINARY_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let cloudinary_secret = env::var("CLOUDINARY_SECRET")
            .ok()
            .filter(|s| !s.trim().is_empty());

        Self {
            server_port,
            server_host,
            app_name,
            database_url,
            database_max_connections,
            database_min_connections,
            jwt_base64_secret,
            jwt_access_token_validity_seconds,
            jwt_refresh_token_validity_seconds,
            client_base_url,
            client_allow_localhost,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            smtp_from,
            smtp_starttls,
            cloudinary_name,
            cloudinary_key,
            cloudinary_secret,
        }
    }
}

pub async fn create_db_pool(config: &AppConfig) -> Result<MySqlPool, sqlx::Error> {
    MySqlPoolOptions::new()
        .max_connections(config.database_max_connections)
        .min_connections(config.database_min_connections)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .connect(&config.database_url)
        .await
}
