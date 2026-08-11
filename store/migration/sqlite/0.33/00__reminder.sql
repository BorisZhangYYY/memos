CREATE TABLE reminder_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0A84FF',
  icon TEXT NOT NULL DEFAULT 'list',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(creator_id, uid)
);

CREATE INDEX idx_reminder_list_creator ON reminder_list(creator_id, row_status, sort_order);

CREATE TABLE reminder (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,
  memo_id INTEGER DEFAULT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  title TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  remind_ts BIGINT DEFAULT NULL,
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  advance_notice_seconds BIGINT NOT NULL DEFAULT 0,
  recurrence_type TEXT NOT NULL DEFAULT '',
  recurrence_interval INTEGER NOT NULL DEFAULT 1,
  recurrence_weekdays TEXT NOT NULL DEFAULT '[]',
  recurrence_end_date TEXT NOT NULL DEFAULT '',
  recurrence_max_occurrences INTEGER NOT NULL DEFAULT 0,
  completed_occurrences INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL CHECK (flagged IN (0, 1)) DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  location_placeholder TEXT NOT NULL DEFAULT '',
  location_latitude REAL NOT NULL DEFAULT 0,
  location_longitude REAL NOT NULL DEFAULT 0,
  location_radius_meters REAL NOT NULL DEFAULT 0,
  location_trigger INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED')) DEFAULT 'PENDING',
  completed_ts BIGINT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  early_notified_ts BIGINT DEFAULT NULL,
  notified_ts BIGINT DEFAULT NULL,
  FOREIGN KEY (list_id) REFERENCES reminder_list(id),
  FOREIGN KEY (memo_id) REFERENCES memo(id)
);

CREATE INDEX idx_reminder_creator_status ON reminder(creator_id, row_status, status);
CREATE INDEX idx_reminder_list ON reminder(list_id, row_status, status, sort_order);
CREATE INDEX idx_reminder_due_date ON reminder(creator_id, due_date);
CREATE INDEX idx_reminder_remind_ts ON reminder(row_status, status, remind_ts);

CREATE TABLE reminder_occurrence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  reminder_uid TEXT NOT NULL,
  list_uid TEXT NOT NULL,
  list_name TEXT NOT NULL,
  title TEXT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  scheduled_date TEXT NOT NULL DEFAULT '',
  remind_ts BIGINT DEFAULT NULL,
  completed_ts BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED'
);

CREATE INDEX idx_reminder_occurrence_creator_completed ON reminder_occurrence(creator_id, completed_ts DESC);
