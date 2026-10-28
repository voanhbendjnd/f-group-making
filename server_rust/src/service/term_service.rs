use sqlx::MySqlPool;

use crate::domain::Term;
use crate::dto::term::{CreateTermRequestDTO, TermDTO};
use crate::error::AppError;
use crate::repository::term_repository::TermRepository;
use crate::util::term_utils::{
    get_chronological_value, get_current_term_name, is_valid_term_name, normalize,
};

pub struct TermService;

impl TermService {
    pub async fn validate_term(pool: &MySqlPool, term_id: Option<i32>) -> Result<(), AppError> {
        if let Some(id) = term_id {
            if id <= 0 || !TermRepository::exists_by_id(pool, id).await? {
                return Err(AppError::bad_request(
                    "Term not found",
                    "termManagement",
                    "termNotFound",
                ));
            }
        }
        Ok(())
    }

    pub async fn validate_user_ids_in_term(
        pool: &MySqlPool,
        user_ids: &[i64],
        term_id: Option<i32>,
    ) -> Result<(), AppError> {
        Self::validate_term(pool, term_id).await?;
        let term_id = match term_id {
            Some(id) => id,
            None => return Ok(()),
        };

        if user_ids.is_empty() || user_ids.iter().any(|&id| id <= 0) {
            return Err(AppError::bad_request(
                "User IDs must not be empty or null",
                "termManagement",
                "invalidids",
            ));
        }

        let mut distinct_ids = user_ids.to_vec();
        distinct_ids.sort_unstable();
        distinct_ids.dedup();

        let found_ids = TermRepository::find_user_ids_in_term(pool, &distinct_ids, term_id).await?;
        if found_ids.len() != distinct_ids.len() {
            return Err(AppError::bad_request(
                "One or more users do not belong to the selected term",
                "termManagement",
                "userOutsideTerm",
            ));
        }

        Ok(())
    }

    pub async fn validate_email_in_term(
        pool: &MySqlPool,
        email: &str,
        term_id: Option<i32>,
    ) -> Result<(), AppError> {
        Self::validate_term(pool, term_id).await?;
        let term_id = match term_id {
            Some(id) => id,
            None => return Ok(()),
        };

        let user_id = TermRepository::find_user_id_by_email(pool, email)
            .await?
            .ok_or_else(|| {
                AppError::bad_request("User not found", "termManagement", "usernotfound")
            })?;

        Self::validate_user_ids_in_term(pool, &[user_id], Some(term_id)).await
    }

    pub async fn ensure_current_term(pool: &MySqlPool) -> Result<Term, AppError> {
        let current_term_name = get_current_term_name(None);
        if let Some(term) = TermRepository::find_by_name(pool, &current_term_name).await? {
            return Ok(term);
        }

        tracing::info!(
            "Current term '{}' not found in database. Auto-creating term...",
            current_term_name
        );
        TermRepository::create(pool, &current_term_name).await
    }

    pub async fn get_available_terms(
        pool: &MySqlPool,
        current_and_future_only: Option<bool>,
    ) -> Result<Vec<TermDTO>, AppError> {
        let current_term = Self::ensure_current_term(pool).await?;
        let current_term_name = current_term.name;
        let current_chronological_val = get_chronological_value(&current_term_name);

        let all_terms = TermRepository::find_all(pool).await?;
        let filter_future = current_and_future_only.unwrap_or(true);

        let mut filtered: Vec<Term> = all_terms
            .into_iter()
            .filter(|t| {
                if !filter_future {
                    return true;
                }
                let val = get_chronological_value(&t.name);
                val.is_none()
                    || (current_chronological_val.is_some() && val >= current_chronological_val)
            })
            .collect();

        filtered.sort_by(|a, b| {
            let val_a = get_chronological_value(&a.name);
            let val_b = get_chronological_value(&b.name);
            val_a.cmp(&val_b)
        });

        let dtos = filtered
            .into_iter()
            .map(|t| {
                let is_current = t.name.eq_ignore_ascii_case(&current_term_name);
                TermDTO {
                    id: t.id,
                    name: t.name,
                    is_current,
                }
            })
            .collect();

        Ok(dtos)
    }

    pub async fn get_current_term(pool: &MySqlPool) -> Result<TermDTO, AppError> {
        let term = Self::ensure_current_term(pool).await?;
        Ok(TermDTO {
            id: term.id,
            name: term.name,
            is_current: true,
        })
    }

    pub async fn create_future_term(
        pool: &MySqlPool,
        request: CreateTermRequestDTO,
    ) -> Result<TermDTO, AppError> {
        if !is_valid_term_name(&request.name) {
            return Err(AppError::bad_request(
                "Term name format is invalid. Required format: SP{yy}, SU{yy}, or FALL{yy}",
                "termManagement",
                "invalidTermFormat",
            ));
        }

        let normalized_name = normalize(&request.name);

        if TermRepository::exists_by_name(pool, &normalized_name).await? {
            return Err(AppError::bad_request(
                format!("Term '{}' already exists.", normalized_name),
                "termManagement",
                "termAlreadyExists",
            ));
        }

        let new_term_val = get_chronological_value(&normalized_name);
        let current_term_val = get_chronological_value(&get_current_term_name(None));

        if let (Some(new_val), Some(cur_val)) = (new_term_val, current_term_val) {
            if new_val < cur_val {
                return Err(AppError::bad_request(
                    "Cannot create a past term. Only current or future terms are allowed.",
                    "termManagement",
                    "pastTermNotAllowed",
                ));
            }
        }

        let saved = TermRepository::create(pool, &normalized_name).await?;
        let is_current = saved
            .name
            .eq_ignore_ascii_case(&get_current_term_name(None));

        Ok(TermDTO {
            id: saved.id,
            name: saved.name,
            is_current,
        })
    }
}
