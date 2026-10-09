CREATE TABLE memo_mood_history (
  memo_id INTEGER PRIMARY KEY,
  memo_uid TEXT NOT NULL,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL,
  mood_level INTEGER NOT NULL,
  deleted_ts BIGINT DEFAULT NULL
);
CREATE INDEX idx_memo_mood_history_creator_deleted ON memo_mood_history(creator_id, deleted_ts, created_ts DESC);
INSERT INTO memo_mood_history (memo_id, memo_uid, creator_id, created_ts, mood_level)
SELECT id, uid, creator_id, created_ts, CAST(json_extract(payload, '$.moodLevel') AS INTEGER)
FROM memo
WHERE CAST(json_extract(payload, '$.moodLevel') AS INTEGER) BETWEEN 1 AND 7;
