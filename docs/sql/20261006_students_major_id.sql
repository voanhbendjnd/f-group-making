-- MySQL: run on the application's database BEFORE starting the updated backend.
-- Stop application writes and back up the database first. DDL implicitly commits.
-- Existing major_id values are preserved; invalid references stop this migration.
-- Hibernate ddl-auto=update does not remove the obsolete NOT NULL major_code column.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_students_major_id$$
CREATE PROCEDURE migrate_students_major_id()
BEGIN
    IF EXISTS (
        SELECT 1 FROM students s LEFT JOIN majors m ON m.id = s.major_id
        WHERE m.id IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration stopped: fix students with missing major_id references first';
    END IF;

    IF EXISTS (
        SELECT 1 FROM majors GROUP BY UPPER(TRIM(code)) HAVING COUNT(*) > 1
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration stopped: resolve duplicate normalized major codes first';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
          AND INDEX_NAME = 'idx_students_major_id'
    ) THEN
        ALTER TABLE students ADD INDEX idx_students_major_id (major_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'
          AND COLUMN_NAME = 'major_id' AND REFERENCED_TABLE_NAME = 'majors'
    ) THEN
        ALTER TABLE students ADD CONSTRAINT fk_students_major
            FOREIGN KEY (major_id) REFERENCES majors(id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'major_code'
    ) THEN
        ALTER TABLE students DROP COLUMN major_code;
    END IF;
END$$
CALL migrate_students_major_id()$$
DROP PROCEDURE migrate_students_major_id$$
DELIMITER ;
