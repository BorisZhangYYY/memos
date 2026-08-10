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
