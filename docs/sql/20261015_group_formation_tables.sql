-- ====================================================================
-- Script Migration: Realtime Group Formation & Approval (v2.2)
-- Document ID: PLAN-20261015-GROUP-REALTIME
-- Date: 2026-10-15
-- ====================================================================

-- 1. Bảng groups: Lưu trữ thực thể nhóm
CREATE TABLE IF NOT EXISTS `groups` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `deadline_id` INT NOT NULL,
    `school_class_id` INT NOT NULL,
    `sequence_no` INT NULL,
    `name` VARCHAR(100) NOT NULL,
    `leader_id` BIGINT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `reject_reason` TEXT NULL,
    `submitted_rules_version` BIGINT NULL,
    `rules_evaluation_snapshot` TEXT NULL,
    `is_lecturer_created` BOOLEAN NOT NULL DEFAULT FALSE,
    `version` BIGINT NOT NULL DEFAULT 0,
    `created_by` VARCHAR(50),
    `created_date` DATETIME(6),
    `last_modified_by` VARCHAR(50),
    `last_modified_date` DATETIME(6),
    CONSTRAINT `fk_groups_deadline` FOREIGN KEY (`deadline_id`) REFERENCES `deadlines` (`id`),
    CONSTRAINT `fk_groups_school_class` FOREIGN KEY (`school_class_id`) REFERENCES `school_classes` (`id`),
    CONSTRAINT `uk_groups_class_deadline_sequence` UNIQUE (`school_class_id`, `deadline_id`, `sequence_no`),
    INDEX `idx_groups_class_deadline` (`school_class_id`, `deadline_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng group_members: Chỉ lưu thành viên HIỆN TẠI đang active
CREATE TABLE IF NOT EXISTS `group_members` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `group_id` BIGINT NOT NULL,
    `student_id` BIGINT NOT NULL,
    `deadline_id` INT NOT NULL,
    `school_class_id` INT NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    `joined_at` DATETIME(6) NOT NULL,
    CONSTRAINT `fk_gm_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_gm_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`),
    CONSTRAINT `uk_active_student_activity` UNIQUE (`student_id`, `deadline_id`),
    INDEX `idx_gm_group_student` (`group_id`, `student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng group_member_history: Lưu trọn vẹn lịch sử biến động thành viên (Append-only audit log)
CREATE TABLE IF NOT EXISTS `group_member_history` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `group_id` BIGINT NOT NULL,
    `student_id` BIGINT NOT NULL,
    `deadline_id` INT NOT NULL,
    `action` VARCHAR(30) NOT NULL, -- JOINED, LEFT, KICKED, TRANSFERRED_LEADER, ASSIGNED_BY_LECTURER
    `performed_by` VARCHAR(50) NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(6) NOT NULL,
    INDEX `idx_gmh_group_id` (`group_id`),
    INDEX `idx_gmh_student_id` (`student_id`),
    INDEX `idx_gmh_deadline_id` (`deadline_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng group_status_history: Lưu vết thay đổi trạng thái nhóm
CREATE TABLE IF NOT EXISTS `group_status_history` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `group_id` BIGINT NOT NULL,
    `from_status` VARCHAR(20) NOT NULL,
    `to_status` VARCHAR(20) NOT NULL,
    `changed_by` VARCHAR(50) NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(6) NOT NULL,
    INDEX `idx_gsh_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng group_rule_overrides: Lưu vết can thiệp bỏ qua Rule của Giảng viên
CREATE TABLE IF NOT EXISTS `group_rule_overrides` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `group_id` BIGINT NOT NULL,
    `lecturer_username` VARCHAR(50) NOT NULL,
    `violated_rules` TEXT NOT NULL,
    `override_reason` TEXT NOT NULL,
    `created_at` DATETIME(6) NOT NULL,
    INDEX `idx_gro_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
