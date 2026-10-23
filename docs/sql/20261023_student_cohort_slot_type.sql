-- MySQL: safe to run again, including after Hibernate ddl-auto=update.
-- Existing rows remain NULL: restore original values from the source roster.
SET @student_cohort_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'students' AND column_name = 'cohort'),
    'SELECT 1',
    'ALTER TABLE `students` ADD COLUMN `cohort` VARCHAR(255) NULL'
);
PREPARE student_cohort_statement FROM @student_cohort_sql;
EXECUTE student_cohort_statement;
DEALLOCATE PREPARE student_cohort_statement;

SET @student_slot_type_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'students' AND column_name = 'slot_type'),
    'SELECT 1',
    'ALTER TABLE `students` ADD COLUMN `slot_type` VARCHAR(255) NULL'
);
PREPARE student_slot_type_statement FROM @student_slot_type_sql;
EXECUTE student_slot_type_statement;
DEALLOCATE PREPARE student_slot_type_statement;
