-- MySQL 8+: run against the application database while the application is stopped.
-- Safe to rerun, including after Hibernate ddl-auto=update has added the column/index.
-- IDs, membership references and group names remain unchanged.

SET @sequence_column_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'groups' AND column_name = 'sequence_no'),
    'SELECT 1',
    'ALTER TABLE `groups` ADD COLUMN `sequence_no` INT NULL'
);
PREPARE sequence_column_statement FROM @sequence_column_sql;
EXECUTE sequence_column_statement;
DEALLOCATE PREPARE sequence_column_statement;

DROP TEMPORARY TABLE IF EXISTS `group_sequence_backfill`;
CREATE TEMPORARY TABLE `group_sequence_backfill` (
    `id` BIGINT PRIMARY KEY,
    `sequence_no` INT NOT NULL
);

START TRANSACTION;
-- Existing numbered groups retain their order; legacy groups are ordered by ID.
INSERT INTO `group_sequence_backfill` (`id`, `sequence_no`)
SELECT `id`, ROW_NUMBER() OVER (
    PARTITION BY `school_class_id`, `deadline_id`
    ORDER BY (`sequence_no` IS NULL), `sequence_no`, `id`
)
FROM `groups`
WHERE `status` <> 'DISBANDED';

-- Free all slots first so an existing unique constraint cannot collide during compaction.
UPDATE `groups` SET `sequence_no` = NULL WHERE `sequence_no` IS NOT NULL;
UPDATE `groups` g JOIN `group_sequence_backfill` b ON b.`id` = g.`id`
SET g.`sequence_no` = b.`sequence_no`, g.`version` = g.`version` + 1;
COMMIT;

DROP TEMPORARY TABLE `group_sequence_backfill`;

SET @sequence_index_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'groups'
             AND index_name = 'uk_groups_class_deadline_sequence'),
    'SELECT 1',
    'ALTER TABLE `groups` ADD CONSTRAINT `uk_groups_class_deadline_sequence` UNIQUE (`school_class_id`, `deadline_id`, `sequence_no`)'
);
PREPARE sequence_index_statement FROM @sequence_index_sql;
EXECUTE sequence_index_statement;
DEALLOCATE PREPARE sequence_index_statement;

-- Verification: no rows should be returned.
SELECT `school_class_id`, `deadline_id`
FROM `groups`
WHERE `status` <> 'DISBANDED'
GROUP BY `school_class_id`, `deadline_id`
HAVING COUNT(`sequence_no`) <> COUNT(*) OR MIN(`sequence_no`) <> 1
    OR MAX(`sequence_no`) <> COUNT(*) OR COUNT(DISTINCT `sequence_no`) <> COUNT(*);
