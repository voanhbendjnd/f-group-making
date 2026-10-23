-- MySQL 8: Them 40 sinh vien vao lop EXE101_DEMO_EMPTY_01 (hoc ky FALL26)
-- Quy tac chuyen nganh: Dung 6 sinh vien SE, con lai cac nganh khac:
--   - 06 sinh vien SE (Software Engineering)
--   - 14 sinh vien IA (Information Assurance)
--   - 10 sinh vien GD (Graphic Design)
--   - 10 sinh vien IB (International Business)
-- Tong cong: 40 sinh vien.
-- Tai khoan: demo.empty01.student001@fpt.edu.vn -> demo.empty01.student040@fpt.edu.vn
-- Mat khau chung: 123456
-- Ma sinh vien: SEE01001..006, IAE01007..020, GDE01021..030, IBE01031..040

USE `fgroup-making`;
SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_empty01_accounts;

CREATE TEMPORARY TABLE tmp_seed_empty01_accounts (
    email VARCHAR(254) NOT NULL PRIMARY KEY,
    full_name VARCHAR(50) NOT NULL,
    authority_name VARCHAR(50) NOT NULL,
    profile_code VARCHAR(50) NOT NULL UNIQUE,
    major_code VARCHAR(20) NOT NULL,
    class_name VARCHAR(50) NOT NULL
);

INSERT INTO tmp_seed_empty01_accounts
    (email, full_name, authority_name, profile_code, major_code, class_name)
VALUES
    -- 6 sinh vien SE
    ('demo.empty01.student001@fpt.edu.vn', 'Nguyen Van An',    'ROLE_STUDENT', 'SEE01001', 'SE', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student002@fpt.edu.vn', 'Tran Thi Binh',    'ROLE_STUDENT', 'SEE01002', 'SE', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student003@fpt.edu.vn', 'Le Minh Chau',     'ROLE_STUDENT', 'SEE01003', 'SE', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student004@fpt.edu.vn', 'Pham Quoc Duy',    'ROLE_STUDENT', 'SEE01004', 'SE', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student005@fpt.edu.vn', 'Hoang Thanh Ha',   'ROLE_STUDENT', 'SEE01005', 'SE', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student006@fpt.edu.vn', 'Vo Gia Huy',       'ROLE_STUDENT', 'SEE01006', 'SE', 'EXE101_DEMO_EMPTY_01'),

    -- 14 sinh vien IA
    ('demo.empty01.student007@fpt.edu.vn', 'Dang Minh Khoa',   'ROLE_STUDENT', 'IAE01007', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student008@fpt.edu.vn', 'Bui Ngoc Linh',    'ROLE_STUDENT', 'IAE01008', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student009@fpt.edu.vn', 'Do Quoc Nam',      'ROLE_STUDENT', 'IAE01009', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student010@fpt.edu.vn', 'Phan Thu Trang',   'ROLE_STUDENT', 'IAE01010', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student011@fpt.edu.vn', 'Nguyen Huu Phuoc', 'ROLE_STUDENT', 'IAE01011', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student012@fpt.edu.vn', 'Tran Mai Phuong',  'ROLE_STUDENT', 'IAE01012', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student013@fpt.edu.vn', 'Le Tuan Kiet',     'ROLE_STUDENT', 'IAE01013', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student014@fpt.edu.vn', 'Pham Bao Ngoc',    'ROLE_STUDENT', 'IAE01014', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student015@fpt.edu.vn', 'Hoang Quang Hai',  'ROLE_STUDENT', 'IAE01015', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student016@fpt.edu.vn', 'Vo Duc Phuc',      'ROLE_STUDENT', 'IAE01016', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student017@fpt.edu.vn', 'Dang Thuy Tien',   'ROLE_STUDENT', 'IAE01017', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student018@fpt.edu.vn', 'Bui Van Duc',      'ROLE_STUDENT', 'IAE01018', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student019@fpt.edu.vn', 'Do Hoang Nam',     'ROLE_STUDENT', 'IAE01019', 'IA', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student020@fpt.edu.vn', 'Phan Khanh Linh',  'ROLE_STUDENT', 'IAE01020', 'IA', 'EXE101_DEMO_EMPTY_01'),

    -- 10 sinh vien GD
    ('demo.empty01.student021@fpt.edu.vn', 'Nguyen Tien Dung', 'ROLE_STUDENT', 'GDE01021', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student022@fpt.edu.vn', 'Tran Anh Tuan',    'ROLE_STUDENT', 'GDE01022', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student023@fpt.edu.vn', 'Le Minh Tri',      'ROLE_STUDENT', 'GDE01023', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student024@fpt.edu.vn', 'Pham Hong Nhung',  'ROLE_STUDENT', 'GDE01024', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student025@fpt.edu.vn', 'Hoang Dang Khoa',  'ROLE_STUDENT', 'GDE01025', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student026@fpt.edu.vn', 'Vo Bich Ngoc',     'ROLE_STUDENT', 'GDE01026', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student027@fpt.edu.vn', 'Dang Van Quyet',   'ROLE_STUDENT', 'GDE01027', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student028@fpt.edu.vn', 'Bui Quynh Anh',    'ROLE_STUDENT', 'GDE01028', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student029@fpt.edu.vn', 'Do Duy Manh',      'ROLE_STUDENT', 'GDE01029', 'GD', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student030@fpt.edu.vn', 'Phan Thi Huong',   'ROLE_STUDENT', 'GDE01030', 'GD', 'EXE101_DEMO_EMPTY_01'),

    -- 10 sinh vien IB
    ('demo.empty01.student031@fpt.edu.vn', 'Nguyen Thanh Tung', 'ROLE_STUDENT', 'IBE01031', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student032@fpt.edu.vn', 'Tran My Tam',       'ROLE_STUDENT', 'IBE01032', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student033@fpt.edu.vn', 'Le Son Tung',       'ROLE_STUDENT', 'IBE01033', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student034@fpt.edu.vn', 'Pham Ha Anh',       'ROLE_STUDENT', 'IBE01034', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student035@fpt.edu.vn', 'Hoang Viet Hoang',  'ROLE_STUDENT', 'IBE01035', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student036@fpt.edu.vn', 'Vo Hoang Long',     'ROLE_STUDENT', 'IBE01036', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student037@fpt.edu.vn', 'Dang Kim Ngan',     'ROLE_STUDENT', 'IBE01037', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student038@fpt.edu.vn', 'Bui Duc Anh',       'ROLE_STUDENT', 'IBE01038', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student039@fpt.edu.vn', 'Do Thanh Binh',     'ROLE_STUDENT', 'IBE01039', 'IB', 'EXE101_DEMO_EMPTY_01'),
    ('demo.empty01.student040@fpt.edu.vn', 'Phan Xuan Truong',  'ROLE_STUDENT', 'IBE01040', 'IB', 'EXE101_DEMO_EMPTY_01');

START TRANSACTION;

-- Dam bao quyen ROLE_STUDENT ton tai
INSERT INTO authorities (name)
SELECT 'ROLE_STUDENT'
WHERE NOT EXISTS (SELECT 1 FROM authorities WHERE name = 'ROLE_STUDENT');

-- Dam bao cac chuyen nganh SE, IA, GD, IB ton tai
INSERT INTO majors (code, name, created_date)
SELECT 'SE', 'Software Engineering', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'SE');

INSERT INTO majors (code, name, created_date)
SELECT 'IA', 'Information Assurance', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'IA');

INSERT INTO majors (code, name, created_date)
SELECT 'GD', 'Graphic Design', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'GD');

INSERT INTO majors (code, name, created_date)
SELECT 'IB', 'International Business', NOW()
WHERE NOT EXISTS (SELECT 1 FROM majors WHERE code = 'IB');

-- Mat khau chung: 123456
SET @seed_password_hash = '$2a$10$iuQTJ2ggPwEkKqT4cO.HFOLyEQQe1bLSFUGxUkYfuuJ2C/tLmS5Wm';
SET @target_class_id = (SELECT id FROM school_classes WHERE name = 'EXE101_DEMO_EMPTY_01' LIMIT 1);

-- 1. Insert vao bang users
INSERT INTO users
    (email, name, password_hash, activated, activation_key, activation_key_expires_at,
     created_by, created_date, last_modified_by, last_modified_date)
SELECT a.email, a.full_name, @seed_password_hash, 1, NULL, NULL,
       'seed-empty01', NOW(), 'seed-empty01', NOW()
FROM tmp_seed_empty01_accounts a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email);

-- 2. Insert vao bang user_authority
INSERT INTO user_authority (user_id, authority_name)
SELECT u.id, a.authority_name
FROM tmp_seed_empty01_accounts a
JOIN users u ON u.email = a.email
WHERE NOT EXISTS (
    SELECT 1 FROM user_authority ua
    WHERE ua.user_id = u.id AND ua.authority_name = a.authority_name
);

-- 3. Insert vao bang students
INSERT INTO students
    (user_id, full_name, member_code, roll_number, major_id, school_class_id)
SELECT u.id, a.full_name, a.profile_code, a.profile_code, m.id, @target_class_id
FROM tmp_seed_empty01_accounts a
JOIN users u ON u.email = a.email
JOIN majors m ON m.code = a.major_code
WHERE a.authority_name = 'ROLE_STUDENT'
  AND @target_class_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id);

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_empty01_accounts;

-- Kiem tra si so va co cau chuyen nganh sau khi seed
SELECT sc.id AS class_id, sc.name AS class_name,
       COUNT(s.user_id) AS total_students,
       SUM(CASE WHEN m.code = 'SE' THEN 1 ELSE 0 END) AS se_students,
       SUM(CASE WHEN m.code = 'IA' THEN 1 ELSE 0 END) AS ia_students,
       SUM(CASE WHEN m.code = 'GD' THEN 1 ELSE 0 END) AS gd_students,
       SUM(CASE WHEN m.code = 'IB' THEN 1 ELSE 0 END) AS ib_students
FROM school_classes sc
LEFT JOIN students s ON s.school_class_id = sc.id
LEFT JOIN majors m ON m.id = s.major_id
WHERE sc.name = 'EXE101_DEMO_EMPTY_01'
GROUP BY sc.id, sc.name;
