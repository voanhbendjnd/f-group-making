-- Migration: Tạo bảng deadlines và school_class_deadline
-- Tương thích với MySQL 8.x và schema hiện tại của fgroup-making

DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_deadlines$$
CREATE PROCEDURE migrate_deadlines()
BEGIN
    -- 1. Bảng deadlines
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deadlines') THEN
        CREATE TABLE deadlines (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT NULL,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            created_by VARCHAR(50) NOT NULL,
            created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_modified_by VARCHAR(50) NULL,
            last_modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_deadlines_time (start_time, end_time),
            INDEX idx_deadlines_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    END IF;

    -- 2. Bảng liên kết Many-to-Many: school_class_deadline
    IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_class_deadline') THEN
        CREATE TABLE school_class_deadline (
            deadline_id INT NOT NULL,
            school_class_id INT NOT NULL,
            PRIMARY KEY (deadline_id, school_class_id),
            CONSTRAINT fk_scd_deadline FOREIGN KEY (deadline_id) REFERENCES deadlines (id) ON DELETE CASCADE,
            CONSTRAINT fk_scd_class FOREIGN KEY (school_class_id) REFERENCES school_classes (id) ON DELETE CASCADE,
            INDEX idx_scd_class (school_class_id),
            INDEX idx_scd_deadline (deadline_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    END IF;
END$$
CALL migrate_deadlines()$$
DROP PROCEDURE IF EXISTS migrate_deadlines$$
DELIMITER ;
