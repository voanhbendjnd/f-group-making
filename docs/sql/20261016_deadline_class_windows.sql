-- MySQL 8: additive migration for class-scoped deadline extensions.
-- Run against the backend database before deploying the new backend.
-- Existing links keep the original deadline time (NULL override).
-- No groups, memberships, classes, or historical cancellation audit are changed.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_deadline_class_windows$$
CREATE PROCEDURE migrate_deadline_class_windows()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_class_deadline'
          AND COLUMN_NAME = 'end_time_override'
    ) THEN
        ALTER TABLE school_class_deadline ADD COLUMN end_time_override DATETIME(6) NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deadlines'
          AND COLUMN_NAME = 'schedule_revision'
    ) THEN
        ALTER TABLE deadlines ADD COLUMN schedule_revision BIGINT NOT NULL DEFAULT 0;
    END IF;
END$$
CALL migrate_deadline_class_windows()$$
DROP PROCEDURE migrate_deadline_class_windows$$
DELIMITER ;
