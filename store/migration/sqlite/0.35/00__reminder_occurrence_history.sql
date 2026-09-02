ALTER TABLE reminder_occurrence ADD COLUMN memo_uid TEXT NOT NULL DEFAULT '';
ALTER TABLE reminder_occurrence ADD COLUMN completion_date TEXT NOT NULL DEFAULT '';
ALTER TABLE reminder_occurrence ADD COLUMN resolved_ts BIGINT NOT NULL DEFAULT 0;

UPDATE reminder_occurrence
SET status = 'COMPLETED_ON_TIME', completion_date = scheduled_date, resolved_ts = completed_ts
WHERE status = 'COMPLETED';

CREATE UNIQUE INDEX idx_reminder_occurrence_period
  ON reminder_occurrence(creator_id, reminder_uid, scheduled_date);
CREATE INDEX idx_reminder_occurrence_creator_schedule
  ON reminder_occurrence(creator_id, scheduled_date DESC, status);
