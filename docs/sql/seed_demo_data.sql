-- Seed User LALA & Students for Class EXE101_G02
INSERT INTO users (id, email, name, password_hash, activated, created_date)
VALUES 
  (6, 'voanhben102@gmail.com', 'LALA', '$2a$10$RIt/OdUl8riEnUFZOCe3T.NxiusKklK8QAIXP8lWlQwIpcADZoQmK', 1, NOW()),
  (7, 'sinhvien1@fpt.edu.vn', 'Nguyen Van An', '$2a$10$RIt/OdUl8riEnUFZOCe3T.NxiusKklK8QAIXP8lWlQwIpcADZoQmK', 1, NOW()),
  (8, 'sinhvien2@fpt.edu.vn', 'Tran Thi Binh', '$2a$10$RIt/OdUl8riEnUFZOCe3T.NxiusKklK8QAIXP8lWlQwIpcADZoQmK', 1, NOW()),
  (9, 'sinhvien3@fpt.edu.vn', 'Le Van Cuong', '$2a$10$RIt/OdUl8riEnUFZOCe3T.NxiusKklK8QAIXP8lWlQwIpcADZoQmK', 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email);

INSERT IGNORE INTO user_authority (user_id, authority_name)
VALUES 
  (6, 'ROLE_STUDENT'),
  (7, 'ROLE_STUDENT'),
  (8, 'ROLE_STUDENT'),
  (9, 'ROLE_STUDENT'),
  (1, 'ROLE_LECTURE');

INSERT IGNORE INTO lecturers (user_id, code)
VALUES (1, 'LEC001');

INSERT INTO school_classes (id, name, lecturer_id, rules_version, created_date)
VALUES (1, 'EXE101_G02', 1, 1, NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name), lecturer_id=VALUES(lecturer_id);

INSERT INTO students (user_id, full_name, member_code, roll_number, major_id, school_class_id)
VALUES 
  (6, 'LALA', 'SE190709', 'SE190709', 6, 1),
  (7, 'Nguyen Van An', 'SE190111', 'SE190111', 6, 1),
  (8, 'Tran Thi Binh', 'IA190222', 'IA190222', 8, 1),
  (9, 'Le Van Cuong', 'GD190333', 'GD190333', 7, 1)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), school_class_id=VALUES(school_class_id), major_id=VALUES(major_id);

INSERT INTO deadlines (id, name, description, start_time, end_time, status, created_date)
VALUES (1, 'Chọn nhóm đợt 1', 'Đợt chọn nhóm lớp EXE101_G02', NOW(), '2026-10-22 08:32:00', 'ACTIVE', NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status), end_time=VALUES(end_time);

INSERT IGNORE INTO school_class_deadline (school_class_id, deadline_id)
VALUES (1, 1);

-- Default Rules for EXE101_G02
INSERT INTO rules (school_class_id, code, value, status, created_date)
VALUES 
  (1, 'MIN_MEMBERS_PER_GROUP', 4, 1, NOW()),
  (1, 'MAX_MEMBERS_PER_GROUP', 5, 1, NOW()),
  (1, 'MIN_SE_MEMBERS_PER_GROUP', 1, 1, NOW())
ON DUPLICATE KEY UPDATE value=VALUES(value), status=VALUES(status);
