-- MySQL: run after 20261012_class_rules.sql, before starting the updated backend.
-- Stop application writes and back up the database first (DDL commits independently).
-- Existing rules stay enabled. Re-running preserves explicitly disabled rules.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_rule_status$$
CREATE PROCEDURE migrate_rule_status()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND COLUMN_NAME = 'status') THEN
        ALTER TABLE rules ADD COLUMN status BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
    IF EXISTS (SELECT 1 FROM rules WHERE status IS NOT NULL AND status NOT IN (0, 1)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rule status must be 0 or 1 before migration';
    END IF;
    UPDATE rules SET status = TRUE WHERE status IS NULL;
    ALTER TABLE rules MODIFY COLUMN status BOOLEAN NOT NULL DEFAULT TRUE;
END$$
CALL migrate_rule_status()$$
DROP PROCEDURE migrate_rule_status$$
DELIMITER ;
