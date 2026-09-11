CREATE TABLE IF NOT EXISTS amazon_account_binding_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_token TEXT NOT NULL,
  email TEXT NOT NULL,
  previous_account_hash TEXT NOT NULL,
  reset_at TEXT NOT NULL
);
