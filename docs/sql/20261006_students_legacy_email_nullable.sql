-- MySQL: run on the database used by the backend, with application writes stopped.
-- Email is stored in users.email. The old students.email column is no longer mapped.
-- Keep its existing data/type/charset/collation, but permit inserts that omit it.
-- This script does not remove the column or change users.email.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_students_legacy_email_nullable$$
CREATE PROCEDURE migrate_students_legacy_email_nullable()
BEGIN
    DECLARE email_column_type VARCHAR(255);
    DECLARE email_data_type VARCHAR(64);
    DECLARE email_charset VARCHAR(64);
    DECLARE email_collation VARCHAR(64);

    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
          AND COLUMN_NAME = 'email' AND IS_NULLABLE = 'NO'
    ) THEN
        SELECT COLUMN_TYPE, DATA_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
            INTO email_column_type, email_data_type, email_charset, email_collation
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'email';

        IF email_data_type NOT IN ('varchar', 'char') THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Migration stopped: inspect the non-varchar/char students.email column manually';
        END IF;

        SET @legacy_student_email_sql = CONCAT(
            'ALTER TABLE students MODIFY COLUMN email ', email_column_type,
            ' CHARACTER SET ', email_charset, ' COLLATE ', email_collation,
            ' NULL DEFAULT NULL'
        );
        PREPARE legacy_student_email_statement FROM @legacy_student_email_sql;
        EXECUTE legacy_student_email_statement;
        DEALLOCATE PREPARE legacy_student_email_statement;
    END IF;
END$$
CALL migrate_students_legacy_email_nullable()$$
DROP PROCEDURE migrate_students_legacy_email_nullable$$
DELIMITER ;
