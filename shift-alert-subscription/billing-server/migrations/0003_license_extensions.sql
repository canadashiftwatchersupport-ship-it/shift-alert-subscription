CREATE TABLE IF NOT EXISTS license_extensions (
  license_token TEXT NOT NULL,
  reason TEXT NOT NULL,
  days INTEGER NOT NULL,
  previous_expires_at TEXT NOT NULL,
  new_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (license_token, reason)
);
