-- system_setting
CREATE TABLE system_setting (
  name TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL
);

-- user
CREATE TABLE "user" (
  id SERIAL PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  username TEXT COLLATE "C" NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER',
  email TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
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
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'
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
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  filename TEXT NOT NULL,
  blob BYTEA,
  type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  memo_id INTEGER DEFAULT NULL,
  storage_type TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- idp
CREATE TABLE idp (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  identifier_filter TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'
);

-- inbox
CREATE TABLE inbox (
  id SERIAL PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL
);

-- reaction
CREATE TABLE reaction (
  id SERIAL PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  creator_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  UNIQUE(creator_id, content_id, reaction_type)
);

-- memo_share
CREATE TABLE memo_share (
  id         SERIAL  PRIMARY KEY,
  uid        TEXT    NOT NULL UNIQUE,
  memo_id    INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  expires_ts BIGINT  DEFAULT NULL,
  FOREIGN KEY (memo_id) REFERENCES memo(id) ON DELETE CASCADE
);

CREATE INDEX idx_memo_share_memo_id ON memo_share(memo_id);

-- user_identity
CREATE TABLE user_identity (
  id         SERIAL  PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  provider   TEXT    NOT NULL,
  extern_uid TEXT    NOT NULL,
  created_ts BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  UNIQUE (provider, extern_uid),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_identity_user_id ON user_identity(user_id);

-- finance_wallet
CREATE TABLE finance_wallet (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  initial_balance_minor BIGINT NOT NULL DEFAULT 0,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (creator_id, name)
);

CREATE INDEX idx_finance_wallet_creator_id ON finance_wallet(creator_id);

-- finance_category
CREATE TABLE finance_category (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  UNIQUE (creator_id, type, name)
);

CREATE INDEX idx_finance_category_creator_id ON finance_category(creator_id);

-- finance_transaction
CREATE TABLE finance_transaction (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  occurred_ts BIGINT NOT NULL,
  type TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  wallet_id INTEGER NOT NULL REFERENCES finance_wallet(id),
  destination_wallet_id INTEGER DEFAULT NULL REFERENCES finance_wallet(id),
  category_id INTEGER DEFAULT NULL REFERENCES finance_category(id),
  note TEXT NOT NULL DEFAULT '',
  adjustment_delta_minor BIGINT NOT NULL DEFAULT 0,
  balance_before_minor BIGINT NOT NULL DEFAULT 0,
  balance_after_minor BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_finance_transaction_creator_occurred ON finance_transaction(creator_id, occurred_ts DESC, id DESC);
CREATE INDEX idx_finance_transaction_wallet_id ON finance_transaction(wallet_id);
CREATE INDEX idx_finance_transaction_destination_wallet_id ON finance_transaction(destination_wallet_id);
CREATE INDEX idx_finance_transaction_category_id ON finance_transaction(category_id);

-- reminder_list
CREATE TABLE reminder_list (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0A84FF',
  icon TEXT NOT NULL DEFAULT 'list',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (creator_id, uid)
);
CREATE INDEX idx_reminder_list_creator ON reminder_list(creator_id, row_status, sort_order);

-- reminder
CREATE TABLE reminder (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL REFERENCES reminder_list(id),
  memo_id INTEGER DEFAULT NULL REFERENCES memo(id),
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
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
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  location_placeholder TEXT NOT NULL DEFAULT '',
  location_latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_trigger INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  completed_ts BIGINT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  early_notified_ts BIGINT DEFAULT NULL,
  notified_ts BIGINT DEFAULT NULL
);
CREATE INDEX idx_reminder_creator_status ON reminder(creator_id, row_status, status);
CREATE INDEX idx_reminder_list ON reminder(list_id, row_status, status, sort_order);
CREATE INDEX idx_reminder_due_date ON reminder(creator_id, due_date);
CREATE INDEX idx_reminder_remind_ts ON reminder(row_status, status, remind_ts);

-- reminder_occurrence
CREATE TABLE reminder_occurrence (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  reminder_uid TEXT NOT NULL,
  list_uid TEXT NOT NULL,
  list_name TEXT NOT NULL,
  title TEXT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  scheduled_date TEXT NOT NULL DEFAULT '',
  remind_ts BIGINT DEFAULT NULL,
  completed_ts BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED'
);
CREATE INDEX idx_reminder_occurrence_creator_completed ON reminder_occurrence(creator_id, completed_ts DESC);
