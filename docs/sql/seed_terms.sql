-- Seed Terms
INSERT INTO terms (id, name, created_date)
VALUES 
  (1, 'FALL26', NOW()),
  (2, 'SP26', NOW()),
  (3, 'SU26', NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Gán term_id cho lớp học hiện có
UPDATE school_classes SET term_id = 1 WHERE term_id IS NULL;
