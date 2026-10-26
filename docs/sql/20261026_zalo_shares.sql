-- MySQL 8.0.16+. MANUAL migration only; stop the app and back up first.
-- New table only. Never run automatically via application startup.
-- Verify parent keys: school_classes.id INT and groups.id BIGINT before execution.
-- No existing groups, memberships, rules or allocation records are changed.
CREATE TABLE IF NOT EXISTS zalo_shares (
    id BIGINT NOT NULL AUTO_INCREMENT,
    school_class_id INT NOT NULL,
    scope VARCHAR(10) NOT NULL,
    group_id BIGINT NULL,
    scope_key VARCHAR(64) NOT NULL,
    title VARCHAR(100) NOT NULL,
    invite_url VARCHAR(512) NOT NULL,
    description VARCHAR(500) NULL,
    qr_public_id VARCHAR(255) NULL,
    qr_format VARCHAR(10) NULL,
    qr_bytes BIGINT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_by VARCHAR(50) NULL,
    created_date DATETIME(6) NULL,
    last_modified_by VARCHAR(50) NULL,
    last_modified_date DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_zalo_scope_key (scope_key),
    KEY idx_zalo_class (school_class_id),
    CONSTRAINT fk_zalo_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id),
    CONSTRAINT fk_zalo_group FOREIGN KEY (group_id) REFERENCES `groups`(id),
    CONSTRAINT ck_zalo_scope CHECK (
        (scope = 'CLASS' AND group_id IS NULL AND scope_key = CONCAT('CLASS:', school_class_id)) OR
        (scope = 'GROUP' AND group_id IS NOT NULL AND scope_key = CONCAT('GROUP:', group_id))
    ),
    CONSTRAINT ck_zalo_qr CHECK (
        (qr_public_id IS NULL AND qr_format IS NULL AND qr_bytes IS NULL) OR
        (qr_public_id IS NOT NULL AND qr_format IN ('png','jpg','webp') AND qr_bytes BETWEEN 1 AND 5242880)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Rollback (manual): export rows and inventory Cloudinary public IDs first.
-- Remove assets only after an intentional, verified rollback; then DROP TABLE zalo_shares.
