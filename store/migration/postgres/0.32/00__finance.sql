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

CREATE TABLE finance_category (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  UNIQUE (creator_id, type, name)
);

CREATE INDEX idx_finance_category_creator_id ON finance_category(creator_id);

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
