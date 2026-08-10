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

CREATE TABLE `finance_category` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `name` VARCHAR(256) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  UNIQUE (`creator_id`, `type`, `name`)
);

CREATE INDEX `idx_finance_category_creator_id` ON `finance_category`(`creator_id`);

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
