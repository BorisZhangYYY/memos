CREATE TABLE `reminder_list` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `row_status` VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  `name` VARCHAR(256) NOT NULL,
  `color` VARCHAR(32) NOT NULL DEFAULT '#0A84FF',
  `icon` VARCHAR(64) NOT NULL DEFAULT 'list',
  `sort_order` INT NOT NULL DEFAULT 0,
  UNIQUE (`creator_id`, `uid`)
);

CREATE INDEX `idx_reminder_list_creator` ON `reminder_list`(`creator_id`, `row_status`, `sort_order`);

CREATE TABLE `reminder` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `list_id` INT NOT NULL,
  `memo_id` INT DEFAULT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `row_status` VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
  `title` VARCHAR(500) NOT NULL,
  `due_date` VARCHAR(10) NOT NULL DEFAULT '',
  `remind_ts` BIGINT DEFAULT NULL,
  `time_zone` VARCHAR(128) NOT NULL DEFAULT 'UTC',
  `advance_notice_seconds` BIGINT NOT NULL DEFAULT 0,
  `recurrence_type` VARCHAR(32) NOT NULL DEFAULT '',
  `recurrence_interval` INT NOT NULL DEFAULT 1,
  `recurrence_weekdays` TEXT NOT NULL,
  `recurrence_end_date` VARCHAR(10) NOT NULL DEFAULT '',
  `recurrence_max_occurrences` INT NOT NULL DEFAULT 0,
  `completed_occurrences` INT NOT NULL DEFAULT 0,
  `flagged` BOOLEAN NOT NULL DEFAULT FALSE,
  `priority` INT NOT NULL DEFAULT 0,
  `tags` TEXT NOT NULL,
  `location_placeholder` VARCHAR(500) NOT NULL DEFAULT '',
  `location_latitude` DOUBLE NOT NULL DEFAULT 0,
  `location_longitude` DOUBLE NOT NULL DEFAULT 0,
  `location_radius_meters` DOUBLE NOT NULL DEFAULT 0,
  `location_trigger` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `completed_ts` BIGINT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `early_notified_ts` BIGINT DEFAULT NULL,
  `notified_ts` BIGINT DEFAULT NULL,
  FOREIGN KEY (`list_id`) REFERENCES `reminder_list`(`id`),
  FOREIGN KEY (`memo_id`) REFERENCES `memo`(`id`)
);

CREATE INDEX `idx_reminder_creator_status` ON `reminder`(`creator_id`, `row_status`, `status`);
CREATE INDEX `idx_reminder_list` ON `reminder`(`list_id`, `row_status`, `status`, `sort_order`);
CREATE INDEX `idx_reminder_due_date` ON `reminder`(`creator_id`, `due_date`);
CREATE INDEX `idx_reminder_remind_ts` ON `reminder`(`row_status`, `status`, `remind_ts`);

CREATE TABLE `reminder_occurrence` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `reminder_uid` VARCHAR(256) NOT NULL,
  `list_uid` VARCHAR(256) NOT NULL,
  `list_name` VARCHAR(255) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `scheduled_date` VARCHAR(10) NOT NULL DEFAULT '',
  `remind_ts` BIGINT DEFAULT NULL,
  `completed_ts` BIGINT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'COMPLETED'
);

CREATE INDEX `idx_reminder_occurrence_creator_completed` ON `reminder_occurrence`(`creator_id`, `completed_ts` DESC);
