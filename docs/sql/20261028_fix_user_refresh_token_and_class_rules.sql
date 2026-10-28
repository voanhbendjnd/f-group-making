-- Migration to fix refresh_token length and school_classes rules_version default

-- 1. refresh_token as JWT can exceed 255 chars for longer emails
ALTER TABLE users MODIFY COLUMN refresh_token VARCHAR(1024) NULL;

-- 2. rules_version default 0 to prevent 1364 error when creating new classes
ALTER TABLE school_classes MODIFY COLUMN rules_version BIGINT NOT NULL DEFAULT 0;

