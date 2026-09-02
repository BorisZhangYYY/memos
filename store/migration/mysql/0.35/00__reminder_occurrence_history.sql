ALTER TABLE `reminder_occurrence`
  ADD COLUMN `memo_uid` VARCHAR(256) NOT NULL DEFAULT '' AFTER `title`,
  ADD COLUMN `completion_date` VARCHAR(10) NOT NULL DEFAULT '' AFTER `completed_ts`,
  ADD COLUMN `resolved_ts` BIGINT NOT NULL DEFAULT 0 AFTER `completion_date`;

UPDATE `reminder_occurrence`
SET `status` = 'COMPLETED_ON_TIME', `completion_date` = `scheduled_date`, `resolved_ts` = `completed_ts`
WHERE `status` = 'COMPLETED';

CREATE UNIQUE INDEX `idx_reminder_occurrence_period`
  ON `reminder_occurrence`(`creator_id`, `reminder_uid`, `scheduled_date`);
CREATE INDEX `idx_reminder_occurrence_creator_schedule`
  ON `reminder_occurrence`(`creator_id`, `scheduled_date` DESC, `status`);
