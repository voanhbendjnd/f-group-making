-- MySQL 8 - SEED DEMO HOAN CHINH
-- 3 giang vien, 20 sinh vien, 2 lop, hoc ky FALL26.
-- Chon dung database backend truoc khi chay.
-- Schema phai duoc backend khoi tao. Neu students.major_code hoac
-- students.email NOT NULL con ton tai, chay migration 20261006_students_*.sql truoc.
-- Mat khau chung: 123456 (BCrypt hash tu file goc).
-- Chay lai khong tao trung ho so, khong di chuyen sinh vien da co.
-- QUAN TRONG: chay bang client dung ngay khi gap SQL error;
-- neu co loi truoc COMMIT, chay ROLLBACK, KHONG chay COMMIT.
-- Sao luu database truoc khi chay. Chi dung cho moi truong demo.
USE `fgroup-making`;
SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_demo_accounts;
CREATE TEMPORARY TABLE tmp_seed_demo_accounts (
    email VARCHAR(254) NOT NULL PRIMARY KEY,
    full_name VARCHAR(50) NOT NULL,
    authority_name VARCHAR(50) NOT NULL,
    profile_code VARCHAR(50) NOT NULL UNIQUE,
    major_code VARCHAR(20) NULL,
    class_name VARCHAR(100) NULL
);

INSERT INTO tmp_seed_demo_accounts
    (email, full_name, authority_name, profile_code, major_code, class_name)
VALUES
    ('demo.lecturer01@fpt.edu.vn', 'Nguyen Van Minh', 'ROLE_LECTURE', 'DEMO_GV01', NULL, NULL),
    ('demo.lecturer02@fpt.edu.vn', 'Tran Thi Lan', 'ROLE_LECTURE', 'DEMO_GV02', NULL, NULL),
    ('demo.lecturer03@fpt.edu.vn', 'Le Quoc Hung', 'ROLE_LECTURE', 'DEMO_GV03', NULL, NULL),
    ('demo.student01@fpt.edu.vn', 'Nguyen Van An', 'ROLE_STUDENT', 'SEDEMO001', 'SE', 'EXE101_DEMO_10SV'),
    ('demo.student02@fpt.edu.vn', 'Tran Thi Binh', 'ROLE_STUDENT', 'SEDEMO002', 'SE', 'EXE101_DEMO_10SV'),
    ('demo.student03@fpt.edu.vn', 'Le Van Cuong', 'ROLE_STUDENT', 'SEDEMO003', 'SE', 'EXE101_DEMO_10SV'),
    ('demo.student04@fpt.edu.vn', 'Pham Thi Dung', 'ROLE_STUDENT', 'SEDEMO004', 'SE', 'EXE101_DEMO_10SV'),
    ('demo.student05@fpt.edu.vn', 'Hoang Van Duc', 'ROLE_STUDENT', 'IADEMO005', 'IA', 'EXE101_DEMO_10SV'),
    ('demo.student06@fpt.edu.vn', 'Vo Thi Ha', 'ROLE_STUDENT', 'IADEMO006', 'IA', 'EXE101_DEMO_10SV'),
    ('demo.student07@fpt.edu.vn', 'Dang Minh Hieu', 'ROLE_STUDENT', 'IADEMO007', 'IA', 'EXE101_DEMO_10SV'),
    ('demo.student08@fpt.edu.vn', 'Bui Thi Linh', 'ROLE_STUDENT', 'GDDEMO008', 'GD', 'EXE101_DEMO_10SV'),
    ('demo.student09@fpt.edu.vn', 'Do Quoc Nam', 'ROLE_STUDENT', 'GDDEMO009', 'GD', 'EXE101_DEMO_10SV'),
    ('demo.student10@fpt.edu.vn', 'Phan Thu Trang', 'ROLE_STUDENT', 'GDDEMO010', 'GD', 'EXE101_DEMO_10SV'),
    ('demo.student11@fpt.edu.vn', 'Nguyen Minh Khoa', 'ROLE_STUDENT', 'SEDEMO011', 'SE', 'EXE102_DEMO_10SV'),
    ('demo.student12@fpt.edu.vn', 'Tran Hoang Long', 'ROLE_STUDENT', 'SEDEMO012', 'SE', 'EXE102_DEMO_10SV'),
    ('demo.student13@fpt.edu.vn', 'Le Thi Ngoc', 'ROLE_STUDENT', 'SEDEMO013', 'SE', 'EXE102_DEMO_10SV'),
    ('demo.student14@fpt.edu.vn', 'Pham Quoc Bao', 'ROLE_STUDENT', 'SEDEMO014', 'SE', 'EXE102_DEMO_10SV'),
    ('demo.student15@fpt.edu.vn', 'Vo Thanh Phong', 'ROLE_STUDENT', 'IADEMO015', 'IA', 'EXE102_DEMO_10SV'),
    ('demo.student16@fpt.edu.vn', 'Dang Thi My Linh', 'ROLE_STUDENT', 'IADEMO016', 'IA', 'EXE102_DEMO_10SV'),
    ('demo.student17@fpt.edu.vn', 'Bui Gia Huy', 'ROLE_STUDENT', 'IADEMO017', 'IA', 'EXE102_DEMO_10SV'),
    ('demo.student18@fpt.edu.vn', 'Hoang Thi Thao', 'ROLE_STUDENT', 'GDDEMO018', 'GD', 'EXE102_DEMO_10SV'),
    ('demo.student19@fpt.edu.vn', 'Do Minh Tuan', 'ROLE_STUDENT', 'GDDEMO019', 'GD', 'EXE102_DEMO_10SV'),
    ('demo.student20@fpt.edu.vn', 'Phan Ngoc Anh', 'ROLE_STUDENT', 'GDDEMO020', 'GD', 'EXE102_DEMO_10SV');

START TRANSACTION;

INSERT INTO authorities (name)
VALUES ('ROLE_LECTURE'), ('ROLE_STUDENT')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO majors (code, name, created_date)
SELECT 'SE', 'Software Engineering', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'SE');
INSERT INTO majors (code, name, created_date)
SELECT 'IA', 'Information Assurance', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'IA');
INSERT INTO majors (code, name, created_date)
SELECT 'GD', 'Graphic Design', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'GD');

INSERT INTO terms (name, created_date)
SELECT 'FALL26', NOW()
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE name = 'FALL26');

SET @demo_term_id = (SELECT MIN(id) FROM terms WHERE name = 'FALL26');
SET @demo_password_hash = '$2a$10$iuQTJ2ggPwEkKqT4cO.HFOLyEQQe1bLSFUGxUkYfuuJ2C/tLmS5Wm';

INSERT INTO users
    (email, name, password_hash, activated, activation_key, activation_key_expires_at,
     created_by, created_date, last_modified_by, last_modified_date)
SELECT email, full_name, @demo_password_hash, 1, NULL, NULL,
       'demo-seed', NOW(), 'demo-seed', NOW()
FROM tmp_seed_demo_accounts
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    password_hash = VALUES(password_hash),
    activated = 1,
    activation_key = NULL,
    activation_key_expires_at = NULL,
    last_modified_by = 'demo-seed',
    last_modified_date = NOW();

INSERT INTO user_authority (user_id, authority_name)
SELECT u.id, a.authority_name
FROM tmp_seed_demo_accounts a
JOIN users u ON u.email = a.email
WHERE NOT EXISTS (
    SELECT 1 FROM user_authority ua
    WHERE ua.user_id = u.id AND ua.authority_name = a.authority_name
);

INSERT INTO lecturers (user_id, code)
SELECT u.id, a.profile_code
FROM tmp_seed_demo_accounts a
JOIN users u ON u.email = a.email
WHERE a.authority_name = 'ROLE_LECTURE'
  AND NOT EXISTS (SELECT 1 FROM lecturers l WHERE l.user_id = u.id);

SET @demo_lecturer01_id = (SELECT id FROM users WHERE email = 'demo.lecturer01@fpt.edu.vn');
SET @demo_lecturer02_id = (SELECT id FROM users WHERE email = 'demo.lecturer02@fpt.edu.vn');

INSERT INTO school_classes
    (name, lecturer_id, term_id, rules_version, created_by, created_date)
SELECT 'EXE101_DEMO_10SV', @demo_lecturer01_id, @demo_term_id, 0, 'demo-seed', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM school_classes
    WHERE name = 'EXE101_DEMO_10SV' AND term_id = @demo_term_id
);

INSERT INTO school_classes
    (name, lecturer_id, term_id, rules_version, created_by, created_date)
SELECT 'EXE102_DEMO_10SV', @demo_lecturer02_id, @demo_term_id, 0, 'demo-seed', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM school_classes
    WHERE name = 'EXE102_DEMO_10SV' AND term_id = @demo_term_id
);

-- Chi tao ho so cho sinh vien chua co, khong sua lop cua ho so cu.
INSERT INTO students
    (user_id, full_name, member_code, roll_number, major_id, school_class_id)
SELECT u.id, a.full_name, a.profile_code, a.profile_code, m.id, sc.id
FROM tmp_seed_demo_accounts a
JOIN users u ON u.email = a.email
JOIN majors m ON m.code = a.major_code
JOIN school_classes sc ON sc.name = a.class_name AND sc.term_id = @demo_term_id
WHERE a.authority_name = 'ROLE_STUDENT'
  AND sc.id = (
      SELECT MIN(sc2.id) FROM school_classes sc2
      WHERE sc2.name = a.class_name AND sc2.term_id = @demo_term_id
  )
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id);

COMMIT;

-- KIEM TRA: 23 tai khoan demo va vai tro.
SELECT u.id, u.email, u.name, u.activated + 0 AS activated, ua.authority_name
FROM tmp_seed_demo_accounts a
JOIN users u ON u.email = a.email
JOIN user_authority ua ON ua.user_id = u.id AND ua.authority_name = a.authority_name
ORDER BY ua.authority_name, u.email;

-- KIEM TRA: moi lop du kien 10 sinh vien (neu chua co ho so cu o lop khac).
SELECT sc.id AS class_id, sc.name AS class_name, t.name AS term_name,
       lecturer.email AS lecturer_email, COUNT(s.user_id) AS total_students
FROM school_classes sc
JOIN terms t ON t.id = sc.term_id
JOIN users lecturer ON lecturer.id = sc.lecturer_id
LEFT JOIN students s ON s.school_class_id = sc.id
WHERE sc.name IN ('EXE101_DEMO_10SV', 'EXE102_DEMO_10SV')
  AND sc.term_id = @demo_term_id
GROUP BY sc.id, sc.name, t.name, lecturer.email
ORDER BY sc.name;

-- KIEM TRA: tai khoan demo nao chua co ho so sinh vien hoac sai lop du kien.
SELECT a.email, a.class_name AS expected_class, sc.name AS actual_class,
       CASE WHEN s.user_id IS NULL THEN 'MISSING_PROFILE'
            ELSE 'DIFFERENT_CLASS' END AS issue
FROM tmp_seed_demo_accounts a
JOIN users u ON u.email = a.email
LEFT JOIN students s ON s.user_id = u.id
LEFT JOIN school_classes sc ON sc.id = s.school_class_id
WHERE a.authority_name = 'ROLE_STUDENT'
  AND (s.user_id IS NULL OR sc.name IS NULL OR sc.name <> a.class_name);

DROP TEMPORARY TABLE IF EXISTS tmp_seed_demo_accounts;