-- MySQL 8: 2 lop moi lop 40 sinh vien + 6 lop rong, hoc ky FALL26.
-- Lop: EXE101_DEMO_40SV_01, EXE101_DEMO_40SV_02.
-- Lop rong: EXE101_DEMO_EMPTY_01..06, cung giang vien demo40.lecturer01@fpt.edu.vn.
-- Sinh vien: demo40.student001@fpt.edu.vn -> demo40.student080@fpt.edu.vn.
-- Giang vien: demo40.lecturer01@fpt.edu.vn, demo40.lecturer02@fpt.edu.vn.
-- Mat khau tai khoan moi: 123456. Tai khoan duoc kich hoat san.
-- Moi lop: 20 SE, 10 IA, 10 GD; chua chia nhom.
-- Backend phai khoi tao schema truoc. Neu schema cu con students.major_code
-- hoac students.email NOT NULL, chay migration 20261006_students_*.sql truoc.
-- Chay toan bo file trong cung mot connection, khong chay dong thoi.
-- Chay lai khong tao trung, khong doi mat khau hay chuyen lop ho so da co.
-- Neu SQL loi truoc COMMIT: dung script va chay ROLLBACK.
USE `fgroup-making`;
SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_40_accounts;

CREATE TEMPORARY TABLE tmp_seed_40_accounts (
    email VARCHAR(254) NOT NULL PRIMARY KEY,
    full_name VARCHAR(50) NOT NULL,
    authority_name VARCHAR(50) NOT NULL,
    profile_code VARCHAR(50) NOT NULL UNIQUE,
    major_code VARCHAR(20) NULL,
    class_name VARCHAR(50) NULL
);

INSERT INTO tmp_seed_40_accounts
    (email, full_name, authority_name, profile_code, major_code, class_name)
VALUES
    ('demo40.lecturer01@fpt.edu.vn', 'Nguyen Van Minh', 'ROLE_LECTURE', 'DEMO40_GV01', NULL, NULL),
    ('demo40.lecturer02@fpt.edu.vn', 'Tran Thi Lan', 'ROLE_LECTURE', 'DEMO40_GV02', NULL, NULL);

-- Sinh dung 80 tai khoan voi so thu tu 001..080.
-- 001..040 thuoc lop 01, 041..080 thuoc lop 02.
INSERT INTO tmp_seed_40_accounts
    (email, full_name, authority_name, profile_code, major_code, class_name)
SELECT CONCAT('demo40.student', LPAD(n, 3, '0'), '@fpt.edu.vn'),
       CONCAT(
           ELT(FLOOR((n - 1) / 10) + 1,
               'Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vo', 'Dang', 'Bui'),
           ' ',
           ELT(MOD(n - 1, 10) + 1,
               'Van An', 'Thi Binh', 'Minh Chau', 'Quoc Duy', 'Thanh Ha',
               'Gia Huy', 'Minh Khoa', 'Ngoc Linh', 'Quoc Nam', 'Thu Trang')
       ),
       'ROLE_STUDENT',
       CONCAT(major_code, 'D40', LPAD(n, 3, '0')),
       major_code,
       IF(n <= 40, 'EXE101_DEMO_40SV_01', 'EXE101_DEMO_40SV_02')
FROM (
    SELECT tens.d * 10 + units.d + 1 AS n,
           CASE WHEN MOD(tens.d * 10 + units.d, 40) < 20 THEN 'SE'
                WHEN MOD(tens.d * 10 + units.d, 40) < 30 THEN 'IA'
                ELSE 'GD' END AS major_code
    FROM (
        SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
    ) tens
    CROSS JOIN (
        SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
        UNION ALL SELECT 8 UNION ALL SELECT 9
    ) units
) numbered_students;

START TRANSACTION;

INSERT INTO authorities (name)
SELECT 'ROLE_LECTURE'
WHERE NOT EXISTS (SELECT 1 FROM authorities WHERE name = 'ROLE_LECTURE');
INSERT INTO authorities (name)
SELECT 'ROLE_STUDENT'
WHERE NOT EXISTS (SELECT 1 FROM authorities WHERE name = 'ROLE_STUDENT');

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

SET @seed40_term_id = (SELECT MIN(id) FROM terms WHERE name = 'FALL26');
SET @seed40_password_hash = '$2a$10$iuQTJ2ggPwEkKqT4cO.HFOLyEQQe1bLSFUGxUkYfuuJ2C/tLmS5Wm';

INSERT INTO users
    (email, name, password_hash, activated, activation_key, activation_key_expires_at,
     created_by, created_date, last_modified_by, last_modified_date)
SELECT a.email, a.full_name, @seed40_password_hash, 1, NULL, NULL,
       'seed-40', NOW(), 'seed-40', NOW()
FROM tmp_seed_40_accounts a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email);

INSERT INTO user_authority (user_id, authority_name)
SELECT u.id, a.authority_name
FROM tmp_seed_40_accounts a
JOIN users u ON u.email = a.email
WHERE NOT EXISTS (
    SELECT 1 FROM user_authority ua
    WHERE ua.user_id = u.id AND ua.authority_name = a.authority_name
);

INSERT INTO lecturers (user_id, code)
SELECT u.id, a.profile_code
FROM tmp_seed_40_accounts a
JOIN users u ON u.email = a.email
WHERE a.authority_name = 'ROLE_LECTURE'
  AND NOT EXISTS (SELECT 1 FROM lecturers l WHERE l.user_id = u.id);

SET @seed40_lecturer01_id = (SELECT id FROM users WHERE email = 'demo40.lecturer01@fpt.edu.vn');
SET @seed40_lecturer02_id = (SELECT id FROM users WHERE email = 'demo40.lecturer02@fpt.edu.vn');

INSERT INTO school_classes
    (name, lecturer_id, term_id, rules_version, created_by, created_date)
SELECT 'EXE101_DEMO_40SV_01', @seed40_lecturer01_id, @seed40_term_id, 0, 'seed-40', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM school_classes
    WHERE name = 'EXE101_DEMO_40SV_01' AND term_id = @seed40_term_id
);

INSERT INTO school_classes
    (name, lecturer_id, term_id, rules_version, created_by, created_date)
SELECT 'EXE101_DEMO_40SV_02', @seed40_lecturer02_id, @seed40_term_id, 0, 'seed-40', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM school_classes
    WHERE name = 'EXE101_DEMO_40SV_02' AND term_id = @seed40_term_id
);

INSERT INTO students
    (user_id, full_name, member_code, roll_number, major_id, school_class_id)
SELECT u.id, a.full_name, a.profile_code, a.profile_code, m.id, sc.id
FROM tmp_seed_40_accounts a
JOIN users u ON u.email = a.email
JOIN majors m ON m.code = a.major_code
JOIN school_classes sc ON sc.name = a.class_name AND sc.term_id = @seed40_term_id
WHERE a.authority_name = 'ROLE_STUDENT'
  AND sc.id = (
      SELECT MIN(sc2.id) FROM school_classes sc2
      WHERE sc2.name = a.class_name AND sc2.term_id = @seed40_term_id
  )
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id);

COMMIT;

-- KIEM TRA SI SO: du kien 2 dong, moi lop 40 sinh vien.
SELECT sc.id AS class_id, sc.name AS class_name, t.name AS term_name,
       lecturer.email AS lecturer_email, COUNT(s.user_id) AS total_students,
       SUM(CASE WHEN m.code = 'SE' THEN 1 ELSE 0 END) AS se_students,
       SUM(CASE WHEN m.code = 'IA' THEN 1 ELSE 0 END) AS ia_students,
       SUM(CASE WHEN m.code = 'GD' THEN 1 ELSE 0 END) AS gd_students
FROM school_classes sc
JOIN terms t ON t.id = sc.term_id
LEFT JOIN users lecturer ON lecturer.id = sc.lecturer_id
LEFT JOIN students s ON s.school_class_id = sc.id
LEFT JOIN majors m ON m.id = s.major_id
WHERE sc.name IN ('EXE101_DEMO_40SV_01', 'EXE101_DEMO_40SV_02')
  AND sc.term_id = @seed40_term_id
GROUP BY sc.id, sc.name, t.name, lecturer.email
ORDER BY sc.name;

-- KIEM TRA HO SO: du kien 0 dong. Neu co dong, ho so cu da duoc thay doi
-- hoac thieu/sai lop; script khong tu di chuyen sinh vien da co.
SELECT a.email, a.class_name AS expected_class, sc.name AS actual_class,
       CASE WHEN s.user_id IS NULL THEN 'MISSING_PROFILE'
            ELSE 'DIFFERENT_CLASS_OR_TERM' END AS issue
FROM tmp_seed_40_accounts a
JOIN users u ON u.email = a.email
LEFT JOIN students s ON s.user_id = u.id
LEFT JOIN school_classes sc ON sc.id = s.school_class_id
WHERE a.authority_name = 'ROLE_STUDENT'
  AND (s.user_id IS NULL OR sc.name IS NULL OR sc.name <> a.class_name
       OR sc.term_id IS NULL OR sc.term_id <> @seed40_term_id);

-- DANH SACH DANG NHAP: 82 tai khoan (2 giang vien, 80 sinh vien).
SELECT u.email, u.name, a.authority_name, s.roll_number,
       m.code AS major_code, sc.name AS class_name
FROM tmp_seed_40_accounts a
JOIN users u ON u.email = a.email
LEFT JOIN students s ON s.user_id = u.id
LEFT JOIN majors m ON m.id = s.major_id
LEFT JOIN school_classes sc ON sc.id = s.school_class_id
ORDER BY a.authority_name, u.email;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_40_accounts;

-- THEM 6 LOP RONG CHO demo40.lecturer01@fpt.edu.vn.
-- Co the chay rieng tu dong USE ben duoi den het file sau khi da seed tai khoan.
-- Can co ho so giang vien va hoc ky FALL26; neu thieu thi khong insert lop.
-- Chi tao lop chua ton tai, khong them sinh vien vao cac lop nay.
USE `fgroup-making`;

SET @seed40_empty_lecturer_id = (
    SELECT u.id
    FROM users u
    JOIN lecturers l ON l.user_id = u.id
    WHERE u.email = 'demo40.lecturer01@fpt.edu.vn'
);
SET @seed40_empty_term_id = (SELECT MIN(id) FROM terms WHERE name = 'FALL26');

START TRANSACTION;

INSERT INTO school_classes
    (name, lecturer_id, term_id, rules_version, created_by, created_date)
SELECT new_classes.name, @seed40_empty_lecturer_id, @seed40_empty_term_id,
       0, 'seed-40', NOW()
FROM (
    SELECT 'EXE101_DEMO_EMPTY_01' AS name
    UNION ALL SELECT 'EXE101_DEMO_EMPTY_02'
    UNION ALL SELECT 'EXE101_DEMO_EMPTY_03'
    UNION ALL SELECT 'EXE101_DEMO_EMPTY_04'
    UNION ALL SELECT 'EXE101_DEMO_EMPTY_05'
    UNION ALL SELECT 'EXE101_DEMO_EMPTY_06'
) new_classes
WHERE @seed40_empty_lecturer_id IS NOT NULL
  AND @seed40_empty_term_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM school_classes sc
      WHERE sc.name = new_classes.name AND sc.term_id = @seed40_empty_term_id
  );

COMMIT;

-- KIEM TRA: du kien 6 dong, moi lop 0 sinh vien khi moi tao.
SELECT sc.id AS class_id, sc.name AS class_name, t.name AS term_name,
       u.email AS lecturer_email, COUNT(s.user_id) AS total_students
FROM school_classes sc
JOIN terms t ON t.id = sc.term_id
JOIN users u ON u.id = sc.lecturer_id
LEFT JOIN students s ON s.school_class_id = sc.id
WHERE sc.lecturer_id = @seed40_empty_lecturer_id
  AND sc.term_id = @seed40_empty_term_id
  AND sc.name IN (
      'EXE101_DEMO_EMPTY_01', 'EXE101_DEMO_EMPTY_02', 'EXE101_DEMO_EMPTY_03',
      'EXE101_DEMO_EMPTY_04', 'EXE101_DEMO_EMPTY_05', 'EXE101_DEMO_EMPTY_06'
  )
GROUP BY sc.id, sc.name, t.name, u.email
ORDER BY sc.name;
