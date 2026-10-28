use serde::{Deserialize, Serialize};

pub mod allocation;
pub mod auth;
pub mod deadline;
pub mod group;
pub mod lecturer;
pub mod major;
pub mod realtime;
pub mod rule;
pub mod school_class;
pub mod student;
pub mod term;

pub use allocation::*;
pub use auth::*;
pub use deadline::*;
pub use group::*;
pub use lecturer::*;
pub use major::*;
pub use realtime::*;
pub use rule::*;
pub use school_class::*;
pub use student::*;
pub use term::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestResponse<T> {
    pub status_code: u16,
    pub error: Option<String>,
    pub message: String,
    pub data: T,
}

impl<T> RestResponse<T> {
    pub fn success(data: T, message: impl Into<String>) -> Self {
        Self {
            status_code: 200,
            error: None,
            message: message.into(),
            data,
        }
    }

    pub fn created(data: T, message: impl Into<String>) -> Self {
        Self {
            status_code: 201,
            error: None,
            message: message.into(),
            data,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaPagination {
    pub page: i64, // 1-indexed
    pub page_size: i64,
    pub pages: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultPaginationDTO<T> {
    pub meta: MetaPagination,
    pub result: Vec<T>,
}

impl<T> ResultPaginationDTO<T> {
    pub fn new(result: Vec<T>, total: i64, page: i64, page_size: i64) -> Self {
        let pages = if page_size > 0 {
            (total + page_size - 1) / page_size
        } else {
            0
        };

        Self {
            meta: MetaPagination {
                page,
                page_size,
                pages,
                total,
            },
            result,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub size: Option<i64>,
    pub sort: Option<String>,
}

impl PaginationQuery {
    pub fn page(&self) -> i64 {
        self.page.unwrap_or(1).max(1)
    }

    pub fn size(&self) -> i64 {
        self.size.unwrap_or(20).clamp(1, 200)
    }

    pub fn offset(&self) -> i64 {
        (self.page() - 1) * self.size()
    }
}
