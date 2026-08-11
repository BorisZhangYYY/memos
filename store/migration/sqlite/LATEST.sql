-- system_setting
CREATE TABLE system_setting (
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(name)
);

-- user
CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  username TEXT COLLATE BINARY NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER',
  email TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

-- user_setting
CREATE TABLE user_setting (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

-- memo
CREATE TABLE memo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'PROTECTED', 'PRIVATE')) DEFAULT 'PRIVATE',
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)) DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}'
);

-- memo_relation
CREATE TABLE memo_relation (
  memo_id INTEGER NOT NULL,
  related_memo_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  UNIQUE(memo_id, related_memo_id, type)
);

-- attachment
CREATE TABLE attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  filename TEXT NOT NULL DEFAULT '',
  blob BLOB DEFAULT NULL,
  type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  memo_id INTEGER,
  storage_type TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- idp
CREATE TABLE idp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  identifier_filter TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}'
);

-- inbox
CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '{}'
);

-- reaction
CREATE TABLE reaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  creator_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  UNIQUE(creator_id, content_id, reaction_type)
);

-- memo_share
CREATE TABLE memo_share (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT    NOT NULL UNIQUE,
  memo_id    INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT  NOT NULL DEFAULT (strftime('%s', 'now')),
  expires_ts BIGINT  DEFAULT NULL,
  FOREIGN KEY (memo_id) REFERENCES memo(id) ON DELETE CASCADE
);

CREATE INDEX idx_memo_share_memo_id ON memo_share(memo_id);

-- user_identity
CREATE TABLE user_identity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  provider   TEXT    NOT NULL,
  extern_uid TEXT    NOT NULL,
  created_ts BIGINT  NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT  NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE (provider, extern_uid),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_identity_user_id ON user_identity(user_id);

-- finance_wallet
CREATE TABLE finance_wallet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  initial_balance_minor BIGINT NOT NULL DEFAULT 0,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  allow_negative_balance INTEGER NOT NULL CHECK (allow_negative_balance IN (0, 1)) DEFAULT 0,
  UNIQUE(creator_id, name)
);

CREATE INDEX idx_finance_wallet_creator_id ON finance_wallet(creator_id);

-- finance_category
CREATE TABLE finance_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  UNIQUE(creator_id, type, name)
);

CREATE INDEX idx_finance_category_creator_id ON finance_category(creator_id);

-- finance_transaction
CREATE TABLE finance_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  occurred_ts BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  wallet_id INTEGER NOT NULL,
  destination_wallet_id INTEGER DEFAULT NULL,
  category_id INTEGER DEFAULT NULL,
  note TEXT NOT NULL DEFAULT '',
  adjustment_delta_minor BIGINT NOT NULL DEFAULT 0,
  balance_before_minor BIGINT NOT NULL DEFAULT 0,
  balance_after_minor BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (wallet_id) REFERENCES finance_wallet(id),
  FOREIGN KEY (destination_wallet_id) REFERENCES finance_wallet(id),
  FOREIGN KEY (category_id) REFERENCES finance_category(id)
);

CREATE INDEX idx_finance_transaction_creator_occurred ON finance_transaction(creator_id, occurred_ts DESC, id DESC);
CREATE INDEX idx_finance_transaction_wallet_id ON finance_transaction(wallet_id);
CREATE INDEX idx_finance_transaction_destination_wallet_id ON finance_transaction(destination_wallet_id);
CREATE INDEX idx_finance_transaction_category_id ON finance_transaction(category_id);

-- reminder_list
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

-- reminder
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

-- reminder_occurrence
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
