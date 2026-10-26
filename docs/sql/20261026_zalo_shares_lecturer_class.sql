-- APPROVED SCRIPT CREATION ONLY. DO NOT execute on application MySQL without separate approval.
-- MySQL 8.0.16+. Existing table was discovered on 2026-10-26 with 0 rows,
-- native ENUM('CLASS','GROUP'), PK/unique scope key and no foreign keys/checks.
-- The original CREATE script remains unchanged for history/fresh installs.
-- Stop ALL application instances, disable ddl-auto=update, take a full backup,
-- verify parent key types (lecturers.user_id BIGINT, school_classes.id/terms.id INT).
-- DDL auto-commits: restore the backup if any step fails. Do not run with --force.

-- Hard stop before ANY DDL if someone has since created a sharing record.
-- Such data needs a separate, reviewed conversion; never infer/delete a legacy GROUP.
SET @zalo_empty_guard = IF((SELECT COUNT(*) FROM zalo_shares) = 0,
    'DO 0', 'SELECT * FROM zalo_conversion_aborted_existing_data_requires_review');
PREPARE zalo_guard FROM @zalo_empty_guard;
EXECUTE zalo_guard;
DEALLOCATE PREPARE zalo_guard;

-- Drop only legacy constraints if the original CREATE script was used.
-- Hibernate-created tables do not have these constraints.
SET @zalo_drop_group_fk = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='zalo_shares' AND CONSTRAINT_NAME='fk_zalo_group'),
    'ALTER TABLE zalo_shares DROP FOREIGN KEY fk_zalo_group', 'DO 0');
PREPARE zalo_step FROM @zalo_drop_group_fk; EXECUTE zalo_step; DEALLOCATE PREPARE zalo_step;
SET @zalo_drop_scope_check = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='zalo_shares' AND CONSTRAINT_NAME='ck_zalo_scope'),
    'ALTER TABLE zalo_shares DROP CHECK ck_zalo_scope', 'DO 0');
PREPARE zalo_step FROM @zalo_drop_scope_check; EXECUTE zalo_step; DEALLOCATE PREPARE zalo_step;

ALTER TABLE zalo_shares
    ADD COLUMN lecturer_id BIGINT NULL,
    ADD COLUMN term_id INT NOT NULL,
    MODIFY COLUMN school_class_id INT NULL,
    MODIFY COLUMN scope VARCHAR(10) NOT NULL,
    MODIFY COLUMN scope_key VARCHAR(100) NOT NULL,
    DROP COLUMN group_id,
    ADD KEY idx_zalo_lecturer_term (lecturer_id, term_id),
    ADD CONSTRAINT fk_zalo_lecturer FOREIGN KEY (lecturer_id) REFERENCES lecturers(user_id),
    ADD CONSTRAINT fk_zalo_term FOREIGN KEY (term_id) REFERENCES terms(id),
    ADD CONSTRAINT ck_zalo_scope CHECK (
        (scope = 'CLASS' AND school_class_id IS NOT NULL AND lecturer_id IS NULL
            AND scope_key = CONCAT('CLASS:', school_class_id)) OR
        (scope = 'LECTURER' AND school_class_id IS NULL AND lecturer_id IS NOT NULL
            AND scope_key = CONCAT('LECTURER:', lecturer_id, ':TERM:', term_id))
    );

-- Hibernate ENUM mapping must be explicit VARCHAR in the entity for schema validation.
SET @zalo_add_class_fk = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='zalo_shares' AND CONSTRAINT_NAME='fk_zalo_class'),
    'DO 0', 'ALTER TABLE zalo_shares ADD CONSTRAINT fk_zalo_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id)');
PREPARE zalo_step FROM @zalo_add_class_fk; EXECUTE zalo_step; DEALLOCATE PREPARE zalo_step;
SET @zalo_add_qr_check = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='zalo_shares' AND CONSTRAINT_NAME='ck_zalo_qr'),
    'DO 0', 'ALTER TABLE zalo_shares ADD CONSTRAINT ck_zalo_qr CHECK ((qr_public_id IS NULL AND qr_format IS NULL AND qr_bytes IS NULL) OR (qr_public_id IS NOT NULL AND qr_format IN (''png'',''jpg'',''webp'') AND qr_bytes BETWEEN 1 AND 5242880))');
PREPARE zalo_step FROM @zalo_add_qr_check; EXECUTE zalo_step; DEALLOCATE PREPARE zalo_step;
-- Verify SHOW CREATE TABLE zalo_shares, then deploy with ddl-auto=validate (or none).
-- This is a one-time conversion, not a rerunnable migration.
