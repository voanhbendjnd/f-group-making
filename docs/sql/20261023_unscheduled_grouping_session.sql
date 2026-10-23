-- Run before opening grouping tools for a class without a deadline.
-- Existing schedules and group references remain unchanged. Safe to rerun.
-- Preserve each existing TIMESTAMP/DATETIME type and precision.
SET @grouping_start_sql = CONCAT('ALTER TABLE `deadlines` MODIFY COLUMN `start_time` ',
    (SELECT COLUMN_TYPE FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deadlines' AND COLUMN_NAME = 'start_time'), ' NULL DEFAULT NULL');
PREPARE grouping_start_statement FROM @grouping_start_sql;
EXECUTE grouping_start_statement;
DEALLOCATE PREPARE grouping_start_statement;

SET @grouping_end_sql = CONCAT('ALTER TABLE `deadlines` MODIFY COLUMN `end_time` ',
    (SELECT COLUMN_TYPE FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deadlines' AND COLUMN_NAME = 'end_time'), ' NULL DEFAULT NULL');
PREPARE grouping_end_statement FROM @grouping_end_sql;
EXECUTE grouping_end_statement;
DEALLOCATE PREPARE grouping_end_statement;
-- An unscheduled session has status UNSCHEDULED and both times NULL.
-- Setting a deadline later updates the same session, preserving groups and history.
