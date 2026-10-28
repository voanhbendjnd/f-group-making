use sqlx::MySqlPool;

use crate::domain::SchoolClass;
use crate::dto::school_class::SchoolClassDTO;
use crate::error::AppError;

pub struct SchoolClassRepository;

impl SchoolClassRepository {
    pub async fn find_by_id(pool: &MySqlPool, id: i32) -> Result<Option<SchoolClass>, AppError> {
        let school_class =
            sqlx::query_as::<_, SchoolClass>("SELECT * FROM school_classes WHERE id = ? LIMIT 1")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| AppError::Internal(format!("Database error in find_by_id: {e}")))?;

        Ok(school_class)
    }

    pub async fn find_by_id_for_update(
        pool: &MySqlPool,
        id: i32,
    ) -> Result<Option<SchoolClass>, AppError> {
        let school_class = sqlx::query_as::<_, SchoolClass>(
            "SELECT * FROM school_classes WHERE id = ? FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in find_by_id_for_update: {e}")))?;

        Ok(school_class)
    }

    pub async fn find_by_id_for_update_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
        id: i32,
    ) -> Result<Option<SchoolClass>, AppError> {
        let school_class = sqlx::query_as::<_, SchoolClass>(
            "SELECT * FROM school_classes WHERE id = ? FOR UPDATE",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Database error in find_by_id_for_update_tx: {e}"))
        })?;

        Ok(school_class)
    }

    pub async fn find_class_dto_by_id(
        pool: &MySqlPool,
        class_id: i32,
    ) -> Result<Option<SchoolClassDTO>, AppError> {
        let row = sqlx::query_as::<_, (
            i32,
            String,
            i32,
            Option<String>,
            Option<i64>,
            Option<String>,
            Option<String>,
            Option<String>,
            i64,
            Option<chrono::DateTime<chrono::Utc>>,
        )>(
            r#"SELECT sc.id, sc.name, sc.term_id, t.name as term_name,
                      sc.lecturer_id, l.code as lecturer_code, u.name as lecturer_name, u.email as lecturer_email,
                      COUNT(s.user_id) as student_count, sc.created_date
               FROM school_classes sc
               LEFT JOIN terms t ON sc.term_id = t.id
               LEFT JOIN lecturers l ON sc.lecturer_id = l.user_id
               LEFT JOIN users u ON l.user_id = u.id
               LEFT JOIN students s ON s.school_class_id = sc.id
               WHERE sc.id = ?
               GROUP BY sc.id, sc.name, sc.term_id, t.name, sc.lecturer_id, l.code, u.name, u.email, sc.created_date"#,
        )
        .bind(class_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in find_class_dto_by_id: {e}")))?;

        Ok(row.map(|r| SchoolClassDTO {
            id: r.0,
            name: r.1,
            term_id: r.2,
            term_name: r.3,
            lecturer_id: r.4,
            lecturer_code: r.5,
            lecturer_name: r.6,
            lecturer_email: r.7,
            student_count: r.8,
            created_date: r.9,
        }))
    }

    pub async fn assign_lecturer(
        pool: &MySqlPool,
        class_id: i32,
        lecturer_id: i64,
    ) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE school_classes SET lecturer_id = ?, last_modified_date = NOW() WHERE id = ?",
        )
        .bind(lecturer_id)
        .bind(class_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in assign_lecturer: {e}")))?;

        Ok(())
    }

    pub async fn search_classes(
        pool: &MySqlPool,
        search: Option<&str>,
        term_id: Option<i32>,
        lecturer_id: Option<i64>,
        page: i64,
        size: i64,
    ) -> Result<(Vec<SchoolClassDTO>, i64), AppError> {
        let mut where_conditions = Vec::new();
        let mut count_bindings: Vec<String> = Vec::new();

        if let Some(tid) = term_id {
            where_conditions.push(format!("sc.term_id = {}", tid));
        }

        if let Some(lid) = lecturer_id {
            where_conditions.push(format!("sc.lecturer_id = {}", lid));
        }

        if let Some(s) = search {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                where_conditions.push(
                    "(LOWER(sc.name) LIKE ? OR LOWER(l.code) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)".to_string(),
                );
                count_bindings.push(pattern.clone());
                count_bindings.push(pattern.clone());
                count_bindings.push(pattern.clone());
                count_bindings.push(pattern);
            }
        }

        let where_clause = if where_conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_conditions.join(" AND "))
        };

        let count_sql = format!(
            r#"SELECT COUNT(DISTINCT sc.id)
               FROM school_classes sc
               LEFT JOIN lecturers l ON sc.lecturer_id = l.user_id
               LEFT JOIN users u ON l.user_id = u.id
               {}"#,
            where_clause
        );

        let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
        for bind in &count_bindings {
            count_query = count_query.bind(bind);
        }
        let total = count_query
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in count classes: {e}")))?;

        let offset = (page.max(1) - 1) * size;
        let select_sql = format!(
            r#"SELECT sc.id, sc.name, sc.term_id, t.name as term_name,
                      sc.lecturer_id, l.code as lecturer_code, u.name as lecturer_name, u.email as lecturer_email,
                      COUNT(s.user_id) as student_count, sc.created_date
               FROM school_classes sc
               LEFT JOIN terms t ON sc.term_id = t.id
               LEFT JOIN lecturers l ON sc.lecturer_id = l.user_id
               LEFT JOIN users u ON l.user_id = u.id
               LEFT JOIN students s ON s.school_class_id = sc.id
               {}
               GROUP BY sc.id, sc.name, sc.term_id, t.name, sc.lecturer_id, l.code, u.name, u.email, sc.created_date
               ORDER BY sc.created_date DESC, sc.id DESC
               LIMIT ? OFFSET ?"#,
            where_clause
        );

        let mut select_query = sqlx::query_as::<
            _,
            (
                i32,
                String,
                i32,
                Option<String>,
                Option<i64>,
                Option<String>,
                Option<String>,
                Option<String>,
                i64,
                Option<chrono::DateTime<chrono::Utc>>,
            ),
        >(&select_sql);

        for bind in &count_bindings {
            select_query = select_query.bind(bind);
        }
        select_query = select_query.bind(size).bind(offset);

        let rows = select_query
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Database error in select classes: {e}")))?;

        let dtos = rows
            .into_iter()
            .map(|r| SchoolClassDTO {
                id: r.0,
                name: r.1,
                term_id: r.2,
                term_name: r.3,
                lecturer_id: r.4,
                lecturer_code: r.5,
                lecturer_name: r.6,
                lecturer_email: r.7,
                student_count: r.8,
                created_date: r.9,
            })
            .collect();

        Ok((dtos, total))
    }

    pub async fn find_by_name_and_term_id(
        pool: &MySqlPool,
        name: &str,
        term_id: i32,
    ) -> Result<Option<SchoolClass>, AppError> {
        let school_class = sqlx::query_as::<_, SchoolClass>(
            "SELECT * FROM school_classes WHERE LOWER(name) = LOWER(?) AND term_id = ? LIMIT 1",
        )
        .bind(name.trim())
        .bind(term_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Database error in find_by_name_and_term_id: {e}"))
        })?;

        Ok(school_class)
    }

    pub async fn find_by_name_and_term_id_for_update(
        pool: &MySqlPool,
        name: &str,
        term_id: i32,
    ) -> Result<Option<SchoolClass>, AppError> {
        let school_class = sqlx::query_as::<_, SchoolClass>(
            "SELECT * FROM school_classes WHERE LOWER(name) = LOWER(?) AND term_id = ? FOR UPDATE",
        )
        .bind(name.trim())
        .bind(term_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_by_name_and_term_id_for_update: {e}"
            ))
        })?;

        Ok(school_class)
    }

    pub async fn find_by_term_id(
        pool: &MySqlPool,
        term_id: i32,
    ) -> Result<Vec<SchoolClass>, AppError> {
        let list =
            sqlx::query_as::<_, SchoolClass>("SELECT * FROM school_classes WHERE term_id = ?")
                .bind(term_id)
                .fetch_all(pool)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Database error in find_by_term_id: {e}"))
                })?;

        Ok(list)
    }

    pub async fn find_by_lecturer_id_and_term_id(
        pool: &MySqlPool,
        lecturer_id: i64,
        term_id: i32,
    ) -> Result<Vec<SchoolClass>, AppError> {
        let list = sqlx::query_as::<_, SchoolClass>(
            "SELECT * FROM school_classes WHERE lecturer_id = ? AND term_id = ?",
        )
        .bind(lecturer_id)
        .bind(term_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Database error in find_by_lecturer_id_and_term_id: {e}"
            ))
        })?;

        Ok(list)
    }

    pub async fn create(
        pool: &MySqlPool,
        name: &str,
        term_id: i32,
        lecturer_id: Option<i64>,
    ) -> Result<SchoolClass, AppError> {
        let res = sqlx::query(
            "INSERT INTO school_classes (name, term_id, lecturer_id, rules_version, created_date, last_modified_date) VALUES (?, ?, ?, 0, NOW(), NOW())",
        )
        .bind(name.trim())
        .bind(term_id)
        .bind(lecturer_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Database error in create school_class: {e}")))?;

        let id = res.last_insert_id() as i32;
        Self::find_by_id(pool, id).await?.ok_or_else(|| {
            AppError::Internal(format!("Failed to retrieve newly created class ID {id}"))
        })
    }
}
