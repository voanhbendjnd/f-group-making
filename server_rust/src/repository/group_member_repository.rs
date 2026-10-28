use sqlx::{MySqlPool, Row};

use crate::domain::{GroupMember, GroupMemberRole};
use crate::dto::group::GroupMemberDTO;
use crate::error::AppError;

pub struct GroupMemberRepository;

impl GroupMemberRepository {
    pub async fn find_by_student_id(
        pool: &MySqlPool,
        student_id: i64,
    ) -> Result<Vec<GroupMember>, AppError> {
        let members = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_members WHERE student_id = ? ORDER BY id ASC",
        )
        .bind(student_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in find_by_student_id: {e}")))?;

        Ok(members)
    }

    pub async fn find_by_group_id(
        pool: &MySqlPool,
        group_id: i64,
    ) -> Result<Vec<GroupMember>, AppError> {
        let members = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_members WHERE group_id = ? ORDER BY id ASC",
        )
        .bind(group_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in find_by_group_id: {e}")))?;

        Ok(members)
    }

    pub async fn find_by_group_id_in(
        pool: &MySqlPool,
        group_ids: &[i64],
    ) -> Result<Vec<GroupMember>, AppError> {
        if group_ids.is_empty() {
            return Ok(Vec::new());
        }
        let in_clause = group_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT * FROM group_members WHERE group_id IN ({}) ORDER BY id",
            in_clause
        );
        let rows = sqlx::query_as::<_, GroupMember>(&sql)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to find members by group ids: {e}")))?;
        Ok(rows)
    }

    pub async fn count_by_group_id(pool: &MySqlPool, group_id: i64) -> Result<i64, AppError> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM group_members WHERE group_id = ?")
                .bind(group_id)
                .fetch_one(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in count_by_group_id: {e}"))
                })?;

        Ok(count)
    }

    pub async fn find_by_student_id_and_deadline_id(
        pool: &MySqlPool,
        student_id: i64,
        deadline_id: i32,
    ) -> Result<Option<GroupMember>, AppError> {
        let member = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_members WHERE student_id = ? AND deadline_id = ? LIMIT 1",
        )
        .bind(student_id)
        .bind(deadline_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_by_student_id_and_deadline_id: {e}"
            ))
        })?;

        Ok(member)
    }

    pub async fn find_by_group_id_and_student_id(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
    ) -> Result<Option<GroupMember>, AppError> {
        let row = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_members WHERE group_id = ? AND student_id = ? LIMIT 1",
        )
        .bind(group_id)
        .bind(student_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to find member by group and student: {e}"))
        })?;
        Ok(row)
    }

    pub async fn find_by_school_class_id_and_deadline_id(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<GroupMember>, AppError> {
        let rows = sqlx::query_as::<_, GroupMember>(
            "SELECT * FROM group_members WHERE school_class_id = ? AND deadline_id = ?",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to find members by class and deadline: {e}"))
        })?;
        Ok(rows)
    }

    pub async fn find_assigned_student_ids(
        pool: &MySqlPool,
        school_class_id: i32,
        deadline_id: i32,
    ) -> Result<Vec<i64>, AppError> {
        let rows = sqlx::query_scalar::<_, i64>(
            "SELECT student_id FROM group_members WHERE school_class_id = ? AND deadline_id = ?",
        )
        .bind(school_class_id)
        .bind(deadline_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to find assigned student ids: {e}")))?;
        Ok(rows)
    }

    pub async fn add_member(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
        deadline_id: i32,
        school_class_id: i32,
        role: &str,
    ) -> Result<GroupMember, AppError> {
        let res = sqlx::query(
            r#"INSERT INTO group_members (group_id, student_id, deadline_id, school_class_id, role, joined_at)
               VALUES (?, ?, ?, ?, ?, NOW())"#,
        )
        .bind(group_id)
        .bind(student_id)
        .bind(deadline_id)
        .bind(school_class_id)
        .bind(role)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to add group member: {e}")))?;

        let id = res.last_insert_id() as i64;
        let member = sqlx::query_as::<_, GroupMember>("SELECT * FROM group_members WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to retrieve inserted group member: {e}"))
            })?;
        Ok(member)
    }

    pub async fn delete_by_group_id_and_student_id(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
    ) -> Result<(), AppError> {
        sqlx::query("DELETE FROM group_members WHERE group_id = ? AND student_id = ?")
            .bind(group_id)
            .bind(student_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to remove group member: {e}")))?;
        Ok(())
    }

    pub async fn delete_by_group_id(pool: &MySqlPool, group_id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM group_members WHERE group_id = ?")
            .bind(group_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to delete group members: {e}")))?;
        Ok(())
    }

    pub async fn update_role(
        pool: &MySqlPool,
        group_id: i64,
        student_id: i64,
        role: &str,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE group_members SET role = ? WHERE group_id = ? AND student_id = ?")
            .bind(role)
            .bind(group_id)
            .bind(student_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update group member role: {e}")))?;
        Ok(())
    }

    pub async fn find_member_details_by_group_id(
        pool: &MySqlPool,
        group_id: i64,
    ) -> Result<Vec<GroupMemberDTO>, AppError> {
        let sql = r#"
            SELECT gm.id, gm.group_id, gm.student_id, gm.role, gm.joined_at,
                   s.roll_number, u.name as full_name, u.email, s.member_code,
                   s.cohort, s.slot_type, s.major_id, m.code as major_code, m.name as major_name,
                   s.self_description
            FROM group_members gm
            JOIN students s ON gm.student_id = s.user_id
            JOIN users u ON s.user_id = u.id
            LEFT JOIN majors m ON s.major_id = m.id
            WHERE gm.group_id = ?
            ORDER BY gm.id
        "#;

        let rows = sqlx::query(sql)
            .bind(group_id)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to fetch member details: {e}")))?;

        let mut dtos = Vec::new();
        for r in rows {
            let role_str: String = r.get("role");
            let role = match role_str.as_str() {
                "LEADER" => GroupMemberRole::LEADER,
                _ => GroupMemberRole::MEMBER,
            };

            dtos.push(GroupMemberDTO {
                id: r.get("id"),
                group_id: r.get("group_id"),
                student_id: r.get("student_id"),
                roll_number: r.get("roll_number"),
                full_name: r.get("full_name"),
                email: r.get("email"),
                member_code: r.get("member_code"),
                cohort: r.get("cohort"),
                slot_type: r.get("slot_type"),
                major_id: r.get("major_id"),
                major_code: r.get("major_code"),
                major_name: r.get("major_name"),
                role,
                joined_at: r.get("joined_at"),
                self_description: r.get("self_description"),
                match_score: None,
                match_reasons: Vec::new(),
            });
        }
        Ok(dtos)
    }

    pub async fn find_allocation_memberships(
        pool: &MySqlPool,
        class_id: i32,
        deadline_id: i32,
        group_ids: &[i64],
        student_ids: &[i64],
    ) -> Result<Vec<GroupMember>, AppError> {
        let group_in = if group_ids.is_empty() {
            "0".to_string()
        } else {
            group_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",")
        };
        let student_in = if student_ids.is_empty() {
            "0".to_string()
        } else {
            student_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",")
        };

        let sql = format!(
            r#"SELECT * FROM group_members
               WHERE (school_class_id = ? AND deadline_id = ?)
                  OR group_id IN ({})
                  OR (student_id IN ({}) AND deadline_id = ?)
               ORDER BY id"#,
            group_in, student_in
        );

        let rows = sqlx::query_as::<_, GroupMember>(&sql)
            .bind(class_id)
            .bind(deadline_id)
            .bind(deadline_id)
            .fetch_all(pool)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to find allocation memberships: {e}"))
            })?;

        Ok(rows)
    }
}
