CREATE TABLE `memo_mood_history` (
  `memo_id` INT NOT NULL PRIMARY KEY,
  `memo_uid` VARCHAR(256) NOT NULL,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL,
  `mood_level` INT NOT NULL,
  `deleted_ts` BIGINT DEFAULT NULL
);
CREATE INDEX `idx_memo_mood_history_creator_deleted` ON `memo_mood_history`(`creator_id`, `deleted_ts`, `created_ts` DESC);
INSERT INTO `memo_mood_history` (memo_id, memo_uid, creator_id, created_ts, mood_level)
SELECT id, uid, creator_id, UNIX_TIMESTAMP(created_ts), CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.moodLevel')) AS SIGNED)
FROM memo
WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.moodLevel')) AS SIGNED) BETWEEN 1 AND 7;
