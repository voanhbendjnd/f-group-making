use chrono::{DateTime, Utc};
use sqlx::MySqlPool;

use crate::domain::{Group, GroupInvitation};
use crate::error::AppError;

pub struct GroupRepository;

impl GroupRepository {
    pub async fn find_by_id(pool: &MySqlPool, id: i64) -> Result<Option<Group>, AppError> {
        let row = sqlx::query_as::<_, Group>("SELECT * FROM `groups` WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to find group by id: {e}")))?;
        Ok(row)
    }

    pub async fn find_by_id_for_update(
        pool: &MySqlPool,
        id: i64,
    ) -> Result<Option<Group>, AppError> {
        let row = sqlx::query_as::<_, Group>("SELECT * FROM `groups` WHERE id = ? FOR UPDATE")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to lock group by id: {e}")))?;
        Ok(row)
    }

    pub async fn exists_by_name_and_status_not_disbanded(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
        name: &str,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM `groups` WHERE school_class_id = ? AND deadline_id = ? AND LOWER(name) = LOWER(?) AND status != 'DISBANDED'",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .bind(name)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to check group name: {e}")))?;

        Ok(count > 0)
    }

    pub async fn find_by_school_class_id_and_deadline_id(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<Group>, AppError> {
        let rows = sqlx::query_as::<_, Group>(
            "SELECT * FROM `groups` WHERE school_class_id = ? AND deadline_id = ? \
             ORDER BY CASE WHEN sequence_no IS NULL THEN 1 ELSE 0 END, sequence_no, id",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to find groups by class & deadline: {e}"))
        })?;
        Ok(rows)
    }

    pub async fn find_by_school_class_id_and_deadline_id_and_status(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
        status: &str,
    ) -> Result<Vec<Group>, AppError> {
        let rows = sqlx::query_as::<_, Group>(
            "SELECT * FROM `groups` WHERE school_class_id = ? AND deadline_id = ? AND status = ? \
             ORDER BY CASE WHEN sequence_no IS NULL THEN 1 ELSE 0 END, sequence_no, id",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .bind(status)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find groups by status: {e}")))?;
        Ok(rows)
    }

    pub async fn find_by_id_and_school_class_id_and_deadline_id(
        pool: &MySqlPool,
        id: i64,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Option<Group>, AppError> {
        let row = sqlx::query_as::<_, Group>(
            "SELECT * FROM `groups` WHERE id = ? AND school_class_id = ? AND deadline_id = ?",
        )
        .bind(id)
        .bind(school_class_id)
        .bind(deadline_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to find group by id, class, deadline: {e}"))
        })?;
        Ok(row)
    }

    pub async fn exists_by_name(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
        name: &str,
        exclude_status: &str,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM `groups` WHERE school_class_id = ? AND deadline_id = ? AND LOWER(name) = LOWER(?) AND status != ?",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .bind(name.trim())
        .bind(exclude_status)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to check existing group name: {e}")))?;
        Ok(count > 0)
    }

    pub async fn count_by_school_class_id_and_deadline_id(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM `groups` WHERE school_class_id = ? AND deadline_id = ?",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to count groups: {e}")))?;
        Ok(count)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_group(
        pool: &MySqlPool,
        deadline_id: i32,
        school_class_id: i32,
        name: &str,
        leader_id: i64,
        status: &str,
        is_lecturer_created: bool,
        sequence_no: Option<i32>,
        actor: Option<&str>,
    ) -> Result<Group, AppError> {
        let res = sqlx::query(
            r#"INSERT INTO `groups` (deadline_id, school_class_id, sequence_no, name, leader_id, status,
                                     is_lecturer_created, version, created_by, created_date, last_modified_by, last_modified_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), ?, NOW())"#,
        )
        .bind(deadline_id)
        .bind(school_class_id)
        .bind(sequence_no)
        .bind(name.trim())
        .bind(leader_id)
        .bind(status)
        .bind(is_lecturer_created)
        .bind(actor)
        .bind(actor)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to insert group: {e}")))?;

        let id = res.last_insert_id() as i64;
        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal("Created group not found".to_string()))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_group(
        pool: &MySqlPool,
        id: i64,
        name: &str,
        leader_id: i64,
        status: &str,
        reject_reason: Option<&str>,
        submitted_rules_version: Option<i64>,
        rules_evaluation_snapshot: Option<&str>,
        sequence_no: Option<i32>,
        version: i64,
        actor: Option<&str>,
    ) -> Result<Group, AppError> {
        let res = sqlx::query(
            r#"UPDATE `groups`
               SET name = ?, leader_id = ?, status = ?, reject_reason = ?,
                   submitted_rules_version = ?, rules_evaluation_snapshot = ?,
                   sequence_no = ?, version = version + 1, last_modified_by = ?, last_modified_date = NOW()
               WHERE id = ? AND version = ?"#,
        )
        .bind(name.trim())
        .bind(leader_id)
        .bind(status)
        .bind(reject_reason)
        .bind(submitted_rules_version)
        .bind(rules_evaluation_snapshot)
        .bind(sequence_no)
        .bind(actor)
        .bind(id)
        .bind(version)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update group: {e}")))?;

        if res.rows_affected() == 0 {
            return Err(AppError::conflict(
                "Dữ liệu nhóm đã bị thay đổi bởi người khác, vui lòng tải lại trang",
                "group",
                "concurrentModification",
            ));
        }

        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal("Updated group not found".to_string()))
    }

    pub async fn update_status(
        pool: &MySqlPool,
        id: i64,
        status: &str,
        reject_reason: Option<&str>,
        sequence_no: Option<i32>,
        version: i64,
        actor: Option<&str>,
    ) -> Result<Group, AppError> {
        let res = sqlx::query(
            r#"UPDATE `groups`
               SET status = ?, reject_reason = ?, sequence_no = ?, version = version + 1,
                   last_modified_by = ?, last_modified_date = NOW()
               WHERE id = ? AND version = ?"#,
        )
        .bind(status)
        .bind(reject_reason)
        .bind(sequence_no)
        .bind(actor)
        .bind(id)
        .bind(version)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update group status: {e}")))?;

        if res.rows_affected() == 0 {
            return Err(AppError::conflict(
                "Dữ liệu nhóm đã bị thay đổi bởi người khác, vui lòng tải lại trang",
                "group",
                "concurrentModification",
            ));
        }

        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal("Group not found".to_string()))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search_group_reviews(
        pool: &MySqlPool,
        term_id: i32,
        class_id: Option<i32>,
        status: Option<&str>,
        search: Option<&str>,
        allowed_class_ids: &[i32],
        offset: u64,
        limit: u64,
    ) -> Result<(Vec<Group>, i64), AppError> {
        if allowed_class_ids.is_empty() {
            return Ok((Vec::new(), 0));
        }

        let mut conditions = Vec::new();
        conditions.push("sc.term_id = ?");

        if let Some(cid) = class_id {
            if !allowed_class_ids.contains(&cid) {
                return Ok((Vec::new(), 0));
            }
            conditions.push("g.school_class_id = ?");
        } else {
            let in_clause = format!(
                "g.school_class_id IN ({})",
                allowed_class_ids
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",")
            );
            conditions.push(Box::leak(in_clause.into_boxed_str()));
        }

        if let Some(st) = status {
            if !st.trim().is_empty() {
                conditions.push("g.status = ?");
            }
        }

        if let Some(q) = search {
            if !q.trim().is_empty() {
                conditions.push("(LOWER(g.name) LIKE ? OR LOWER(sc.name) LIKE ?)");
            }
        }

        let where_clause = conditions.join(" AND ");

        let count_sql = format!(
            "SELECT COUNT(DISTINCT g.id) FROM `groups` g \
             JOIN school_classes sc ON g.school_class_id = sc.id \
             WHERE {}",
            where_clause
        );

        let select_sql = format!(
            "SELECT g.* FROM `groups` g \
             JOIN school_classes sc ON g.school_class_id = sc.id \
             WHERE {} \
             ORDER BY g.created_date DESC, g.id DESC \
             LIMIT ? OFFSET ?",
            where_clause
        );

        // Build count query
        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(term_id);
        if let Some(cid) = class_id {
            count_query = count_query.bind(cid);
        }
        if let Some(st) = status {
            if !st.trim().is_empty() {
                count_query = count_query.bind(st.trim());
            }
        }
        if let Some(q) = search {
            if !q.trim().is_empty() {
                let term = format!("%{}%", q.trim().to_lowercase());
                count_query = count_query.bind(term.clone()).bind(term);
            }
        }

        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to count group reviews: {e}")))?;

        // Build select query
        let mut select_query = sqlx::query_as::<_, Group>(&select_sql).bind(term_id);
        if let Some(cid) = class_id {
            select_query = select_query.bind(cid);
        }
        if let Some(st) = status {
            if !st.trim().is_empty() {
                select_query = select_query.bind(st.trim());
            }
        }
        if let Some(q) = search {
            if !q.trim().is_empty() {
                let term = format!("%{}%", q.trim().to_lowercase());
                select_query = select_query.bind(term.clone()).bind(term);
            }
        }

        let rows = select_query
            .bind(limit as i64)
            .bind(offset as i64)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to search group reviews: {e}")))?;

        Ok((rows, total))
    }
}

pub struct GroupInvitationRepository;

impl GroupInvitationRepository {
    pub async fn find_by_id(
        pool: &MySqlPool,
        id: i64,
    ) -> Result<Option<GroupInvitation>, AppError> {
        let row =
            sqlx::query_as::<_, GroupInvitation>("SELECT * FROM group_invitations WHERE id = ?")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to find invitation by id: {e}")))?;
        Ok(row)
    }

    pub async fn find_by_student_id_and_deadline_id_and_status(
        pool: &MySqlPool,
        student_id: i64,
        deadline_id: i32,
        status: &str,
    ) -> Result<Vec<GroupInvitation>, AppError> {
        let rows = sqlx::query_as::<_, GroupInvitation>(
            "SELECT * FROM group_invitations WHERE student_id = ? AND deadline_id = ? AND status = ? ORDER BY id DESC",
        )
        .bind(student_id)
        .bind(deadline_id)
        .bind(status)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find invitations by student & deadline: {e}")))?;
        Ok(rows)
    }

    pub async fn find_by_group_id_and_status(
        pool: &MySqlPool,
        group_id: i64,
        status: &str,
    ) -> Result<Vec<GroupInvitation>, AppError> {
        let rows = sqlx::query_as::<_, GroupInvitation>(
            "SELECT * FROM group_invitations WHERE group_id = ? AND status = ? ORDER BY id DESC",
        )
        .bind(group_id)
        .bind(status)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find invitations by group: {e}")))?;
        Ok(rows)
    }

    pub async fn find_by_group_id_and_student_id_and_status(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
        status: &str,
    ) -> Result<Option<GroupInvitation>, AppError> {
        let row = sqlx::query_as::<_, GroupInvitation>(
            "SELECT * FROM group_invitations WHERE group_id = ? AND student_id = ? AND status = ? LIMIT 1",
        )
        .bind(group_id)
        .bind(student_id)
        .bind(status)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find invitation: {e}")))?;
        Ok(row)
    }

    pub async fn exists_pending(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM group_invitations WHERE group_id = ? AND student_id = ? AND status = 'PENDING'",
        )
        .bind(group_id)
        .bind(student_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to check pending invitation: {e}")))?;
        Ok(count > 0)
    }

    pub async fn create_invitation(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
        inviter_id: i64,
        deadline_id: i32,
        school_class_id: i32,
        message: Option<&str>,
    ) -> Result<GroupInvitation, AppError> {
        let res = sqlx::query(
            r#"INSERT INTO group_invitations (group_id, student_id, inviter_id, deadline_id, school_class_id, status, message, created_at)
               VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW())"#,
        )
        .bind(group_id)
        .bind(student_id)
        .bind(inviter_id)
        .bind(deadline_id)
        .bind(school_class_id)
        .bind(message)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create invitation: {e}")))?;

        let id = res.last_insert_id() as i64;
        Self::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::Internal("Invitation not found".to_string()))
    }

    pub async fn update_status(
        pool: &MySqlPool,
        id: i64,
        status: &str,
        responded_at: Option<DateTime<Utc>>,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE group_invitations SET status = ?, responded_at = ? WHERE id = ?")
            .bind(status)
            .bind(responded_at)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update invitation status: {e}")))?;
        Ok(())
    }

    pub async fn cancel_all_pending_for_student_in_deadline(
        pool: &MySqlPool,
        student_id: i64,
        deadline_id: i32,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE group_invitations SET status = 'CANCELLED', responded_at = NOW() \
             WHERE student_id = ? AND deadline_id = ? AND status = 'PENDING'",
        )
        .bind(student_id)
        .bind(deadline_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to cancel pending invitations: {e}")))?;
        Ok(())
    }

    pub async fn find_by_school_class_id_and_deadline_id_and_status(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
        status: &str,
    ) -> Result<Vec<GroupInvitation>, AppError> {
        let rows = sqlx::query_as::<_, GroupInvitation>(
            "SELECT * FROM group_invitations WHERE school_class_id = ? AND deadline_id = ? AND status = ? ORDER BY id ASC",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .bind(status)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find invitations by class, deadline, status: {e}")))?;
        Ok(rows)
    }
}

pub struct GroupHistoryRepository;

impl GroupHistoryRepository {
    pub async fn log_member_history(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
        deadline_id: i32,
        action: &str,
        performed_by: &str,
        note: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"INSERT INTO group_member_history (group_id, student_id, deadline_id, action, performed_by, note, created_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW())"#,
        )
        .bind(group_id)
        .bind(student_id)
        .bind(deadline_id)
        .bind(action)
        .bind(performed_by)
        .bind(note)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to log member history: {e}")))?;
        Ok(())
    }

    pub async fn log_status_history(
        pool: &MySqlPool,
        group_id: i64,
        from_status: &str,
        to_status: &str,
        changed_by: &str,
        reason: Option<&str>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"INSERT INTO group_status_history (group_id, from_status, to_status, changed_by, reason, created_at)
               VALUES (?, ?, ?, ?, ?, NOW())"#,
        )
        .bind(group_id)
        .bind(from_status)
        .bind(to_status)
        .bind(changed_by)
        .bind(reason)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to log status history: {e}")))?;
        Ok(())
    }

    pub async fn log_rule_override(
        pool: &MySqlPool,
        group_id: i64,
        lecturer_username: &str,
        violated_rules: &str,
        override_reason: &str,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"INSERT INTO group_rule_overrides (group_id, lecturer_username, violated_rules, override_reason, created_at)
               VALUES (?, ?, ?, ?, NOW())"#,
        )
        .bind(group_id)
        .bind(lecturer_username)
        .bind(violated_rules)
        .bind(override_reason)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to log rule override: {e}")))?;
        Ok(())
    }

    pub async fn has_been_submitted(pool: &MySqlPool, group_id: i64) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM group_status_history WHERE group_id = ? AND to_status = 'PENDING'",
        )
        .bind(group_id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to check status history: {e}")))?;
        Ok(count > 0)
    }

    pub async fn find_latest_submission_time(
        pool: &MySqlPool,
        group_id: i64,
    ) -> Result<Option<DateTime<Utc>>, AppError> {
        let row = sqlx::query_scalar::<_, DateTime<Utc>>(
            "SELECT created_at FROM group_status_history WHERE group_id = ? AND to_status = 'PENDING' \
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(group_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch submission time: {e}")))?;
        Ok(row)
    }
}
