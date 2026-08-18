-- system_setting
CREATE TABLE `system_setting` (
  `name` VARCHAR(256) NOT NULL PRIMARY KEY,
  `value` LONGTEXT NOT NULL,
  `description` TEXT NOT NULL
);

-- user
CREATE TABLE `user` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `username` VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
  `role` VARCHAR(256) NOT NULL DEFAULT 'USER',
  `email` VARCHAR(256) NOT NULL DEFAULT '',
  `nickname` VARCHAR(256) NOT NULL DEFAULT '',
  `password_hash` VARCHAR(256) NOT NULL,
  `avatar_url` LONGTEXT NOT NULL,
  `description` VARCHAR(256) NOT NULL DEFAULT ''
);

-- user_setting
CREATE TABLE `user_setting` (
  `user_id` INT NOT NULL,
  `key` VARCHAR(256) NOT NULL,
  `value` LONGTEXT NOT NULL,
  UNIQUE(`user_id`,`key`)
);

-- memo
CREATE TABLE `memo` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `content` TEXT NOT NULL,
  `visibility` VARCHAR(256) NOT NULL DEFAULT 'PRIVATE',
  `pinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `payload` JSON NOT NULL
);

-- memo_relation
CREATE TABLE `memo_relation` (
  `memo_id` INT NOT NULL,
  `related_memo_id` INT NOT NULL,
  `type` VARCHAR(256) NOT NULL,
  UNIQUE(`memo_id`,`related_memo_id`,`type`)
);

-- attachment
CREATE TABLE `attachment` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `filename` TEXT NOT NULL,
  `blob` MEDIUMBLOB,
  `type` VARCHAR(256) NOT NULL DEFAULT '',
  `size` INT NOT NULL DEFAULT '0',
  `memo_id` INT DEFAULT NULL,
  `storage_type` VARCHAR(256) NOT NULL DEFAULT '',
  `reference` TEXT NOT NULL DEFAULT (''),
  `payload` TEXT NOT NULL
);

-- idp
CREATE TABLE `idp` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `type` TEXT NOT NULL,
  `identifier_filter` VARCHAR(256) NOT NULL DEFAULT '',
  `config` TEXT NOT NULL
);

-- inbox
CREATE TABLE `inbox` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `status` TEXT NOT NULL,
  `message` TEXT NOT NULL
);

-- reaction
CREATE TABLE `reaction` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `creator_id` INT NOT NULL,
  `content_id` VARCHAR(256) NOT NULL,
  `reaction_type` VARCHAR(256) NOT NULL,
  UNIQUE(`creator_id`,`content_id`,`reaction_type`)  
);

-- memo_share
CREATE TABLE `memo_share` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid`        VARCHAR(255) NOT NULL UNIQUE,
  `memo_id`    INT          NOT NULL,
  `creator_id` INT          NOT NULL,
  `created_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `expires_ts` BIGINT       DEFAULT NULL,
  FOREIGN KEY (`memo_id`) REFERENCES `memo`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_memo_share_memo_id` ON `memo_share`(`memo_id`);

-- user_identity
CREATE TABLE `user_identity` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT          NOT NULL,
  `provider`   VARCHAR(256) NOT NULL,
  `extern_uid` VARCHAR(256) NOT NULL,
  `created_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  UNIQUE (`provider`, `extern_uid`),
  UNIQUE (`user_id`, `provider`)
);

CREATE INDEX `idx_user_identity_user_id` ON `user_identity`(`user_id`);

-- finance_wallet
CREATE TABLE `finance_wallet` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `name` VARCHAR(256) NOT NULL,
  `initial_balance_minor` BIGINT NOT NULL DEFAULT 0,
  `balance_minor` BIGINT NOT NULL DEFAULT 0,
  `allow_negative_balance` BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (`creator_id`, `name`)
);

CREATE INDEX `idx_finance_wallet_creator_id` ON `finance_wallet`(`creator_id`);

-- finance_category
CREATE TABLE `finance_category` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `name` VARCHAR(256) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `emoji` VARCHAR(64) CHARACTER SET utf8mb4 NOT NULL DEFAULT '',
  UNIQUE (`creator_id`, `type`, `name`)
);

CREATE INDEX `idx_finance_category_creator_id` ON `finance_category`(`creator_id`);

-- finance_transaction
CREATE TABLE `finance_transaction` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `occurred_ts` BIGINT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `amount_minor` BIGINT NOT NULL,
  `wallet_id` INT NOT NULL,
  `destination_wallet_id` INT DEFAULT NULL,
  `category_id` INT DEFAULT NULL,
  `note` TEXT NOT NULL,
  `adjustment_delta_minor` BIGINT NOT NULL DEFAULT 0,
  `balance_before_minor` BIGINT NOT NULL DEFAULT 0,
  `balance_after_minor` BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (`wallet_id`) REFERENCES `finance_wallet`(`id`),
  FOREIGN KEY (`destination_wallet_id`) REFERENCES `finance_wallet`(`id`),
  FOREIGN KEY (`category_id`) REFERENCES `finance_category`(`id`)
);

CREATE INDEX `idx_finance_transaction_creator_occurred` ON `finance_transaction`(`creator_id`, `occurred_ts` DESC, `id` DESC);
CREATE INDEX `idx_finance_transaction_wallet_id` ON `finance_transaction`(`wallet_id`);
CREATE INDEX `idx_finance_transaction_destination_wallet_id` ON `finance_transaction`(`destination_wallet_id`);
CREATE INDEX `idx_finance_transaction_category_id` ON `finance_transaction`(`category_id`);

-- reminder_list
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

-- reminder
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

-- reminder_occurrence
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
