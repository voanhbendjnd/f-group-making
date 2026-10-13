-- MySQL migration: run BEFORE starting the updated backend, with application writes stopped.
-- Back up the database first: MySQL DDL commits independently of the procedure.
-- Global rules are archived and copied to every existing class; no legacy values are discarded.
-- New classes use unsaved suggestions until the assigned lecturer saves their rules.
DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_class_rules$$
CREATE PROCEDURE migrate_class_rules()
BEGIN
    DECLARE finished INT DEFAULT 0;
    DECLARE legacy_index VARCHAR(64);
    DECLARE code_indexes CURSOR FOR
        SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rules'
          AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'code';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND COLUMN_NAME = 'school_class_id') THEN
        ALTER TABLE rules ADD COLUMN school_class_id INT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_classes' AND COLUMN_NAME = 'rules_version') THEN
        ALTER TABLE school_classes ADD COLUMN rules_version BIGINT NOT NULL DEFAULT 0;
    END IF;
    UPDATE school_classes SET rules_version = 0 WHERE rules_version IS NULL;
    ALTER TABLE school_classes MODIFY COLUMN rules_version BIGINT NOT NULL DEFAULT 0;

    IF EXISTS (SELECT 1 FROM rules r LEFT JOIN school_classes sc ON sc.id = r.school_class_id
               WHERE r.school_class_id IS NOT NULL AND sc.id IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fix rules referencing a missing class before migration';
    END IF;
    IF EXISTS (SELECT 1 FROM rules WHERE school_class_id IS NOT NULL GROUP BY school_class_id, code HAVING COUNT(*) > 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resolve duplicate class rule codes before migration';
    END IF;

    CREATE TABLE IF NOT EXISTS rules_global_legacy_20261012 (
        id INT PRIMARY KEY, code VARCHAR(50) NOT NULL, `value` INT NOT NULL,
        created_by VARCHAR(50), created_date DATETIME(6),
        last_modified_by VARCHAR(50), last_modified_date DATETIME(6)
    );
    INSERT IGNORE INTO rules_global_legacy_20261012
        (id, code, `value`, created_by, created_date, last_modified_by, last_modified_date)
        SELECT id, code, `value`, created_by, created_date, last_modified_by, last_modified_date
        FROM rules WHERE school_class_id IS NULL;

    -- Hibernate update does not remove the old unique constraint on code.
    OPEN code_indexes;
    remove_legacy_indexes: LOOP
        FETCH code_indexes INTO legacy_index;
        IF finished = 1 THEN LEAVE remove_legacy_indexes; END IF;
        SET @class_rules_ddl = CONCAT('ALTER TABLE rules DROP INDEX `', REPLACE(legacy_index, '`', '``'), '`');
        PREPARE class_rules_stmt FROM @class_rules_ddl;
        EXECUTE class_rules_stmt;
        DEALLOCATE PREPARE class_rules_stmt;
    END LOOP;
    CLOSE code_indexes;

    INSERT INTO rules (school_class_id, code, `value`, created_by, created_date, last_modified_by, last_modified_date)
        SELECT sc.id, legacy.code, legacy.`value`, legacy.created_by, legacy.created_date,
               legacy.last_modified_by, legacy.last_modified_date
        FROM school_classes sc CROSS JOIN rules_global_legacy_20261012 legacy
        WHERE EXISTS (SELECT 1 FROM rules global_rule WHERE global_rule.id = legacy.id AND global_rule.school_class_id IS NULL)
          AND NOT EXISTS (SELECT 1 FROM rules existing WHERE existing.school_class_id = sc.id AND existing.code = legacy.code);
    -- Originals remain in rules_global_legacy_20261012 after their per-class copies are created.
    DELETE FROM rules WHERE school_class_id IS NULL;
    ALTER TABLE rules MODIFY COLUMN school_class_id INT NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND INDEX_NAME = 'ux_rules_class_code') THEN
        ALTER TABLE rules ADD CONSTRAINT ux_rules_class_code UNIQUE (school_class_id, code);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND CONSTRAINT_NAME = 'fk_rules_school_class') THEN
        ALTER TABLE rules ADD CONSTRAINT fk_rules_school_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id);
    END IF;
END$$
CALL migrate_class_rules()$$
DROP PROCEDURE migrate_class_rules$$
DELIMITER ;
