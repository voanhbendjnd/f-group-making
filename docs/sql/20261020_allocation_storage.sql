-- APPROVED DESIGN: additive allocation staging/idempotency/history tables (MySQL 8).
-- Do not execute against application MySQL without separate deployment approval and backup.
-- Select the intended database explicitly in your SQL client; this script has no USE statement.
-- Existing tables with these names must be inspected first; do not use IF NOT EXISTS to hide incompatible schemas.
CREATE TABLE allocation_previews (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 owner_id BIGINT NOT NULL, school_class_id INT NOT NULL, deadline_id INT NOT NULL,
 target_count INT NOT NULL, seed BIGINT NOT NULL,
 snapshot_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 plan_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload LONGTEXT NULL, format_version INT NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL, applied_at DATETIME(6) NULL,
 version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT fk_ap_owner FOREIGN KEY (owner_id) REFERENCES users(id),
 CONSTRAINT fk_ap_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id),
 CONSTRAINT fk_ap_deadline FOREIGN KEY (deadline_id) REFERENCES deadlines(id),
 CONSTRAINT ck_ap_target CHECK (target_count > 0),
 CONSTRAINT ck_ap_expiry CHECK (expires_at > created_at),
 INDEX idx_ap_scope_owner (school_class_id, deadline_id, owner_id), INDEX idx_ap_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE allocation_apply_requests (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 owner_id BIGINT NOT NULL, school_class_id INT NOT NULL, deadline_id INT NOT NULL,
 preview_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 key_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status VARCHAR(20) NOT NULL, result_json LONGTEXT NULL, failure_code VARCHAR(80) NULL,
 created_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT uk_aar_key UNIQUE (owner_id, school_class_id, deadline_id, key_hash),
 CONSTRAINT fk_aar_owner FOREIGN KEY (owner_id) REFERENCES users(id),
 CONSTRAINT fk_aar_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id),
 CONSTRAINT fk_aar_deadline FOREIGN KEY (deadline_id) REFERENCES deadlines(id),
 CONSTRAINT fk_aar_preview FOREIGN KEY (preview_id) REFERENCES allocation_previews(id),
 CONSTRAINT ck_aar_status CHECK (status IN ('READY','PROCESSING','FAILED','SUCCEEDED')),
 INDEX idx_aar_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE allocation_runs (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 preview_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 apply_request_id BIGINT NULL, actor_id BIGINT NOT NULL, school_class_id INT NOT NULL, deadline_id INT NOT NULL,
 target_count INT NOT NULL, seed BIGINT NOT NULL, applied_at DATETIME(6) NOT NULL,
 snapshot_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 plan_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, result_json LONGTEXT NOT NULL,
 CONSTRAINT uk_ar_preview UNIQUE (preview_id), CONSTRAINT uk_ar_request UNIQUE (apply_request_id),
 CONSTRAINT fk_ar_preview FOREIGN KEY (preview_id) REFERENCES allocation_previews(id),
 CONSTRAINT fk_ar_request FOREIGN KEY (apply_request_id) REFERENCES allocation_apply_requests(id) ON DELETE SET NULL,
 CONSTRAINT fk_ar_actor FOREIGN KEY (actor_id) REFERENCES users(id),
 CONSTRAINT fk_ar_class FOREIGN KEY (school_class_id) REFERENCES school_classes(id),
 CONSTRAINT fk_ar_deadline FOREIGN KEY (deadline_id) REFERENCES deadlines(id),
 CONSTRAINT ck_ar_target CHECK (target_count > 0),
 INDEX idx_ar_scope_time (school_class_id, deadline_id, applied_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
