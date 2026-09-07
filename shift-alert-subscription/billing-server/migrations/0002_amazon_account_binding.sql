CREATE TABLE IF NOT EXISTS license_amazon_accounts (license_token TEXT PRIMARY KEY, account_hash TEXT NOT NULL, bound_at TEXT NOT NULL DEFAULT (datetime('now')));
