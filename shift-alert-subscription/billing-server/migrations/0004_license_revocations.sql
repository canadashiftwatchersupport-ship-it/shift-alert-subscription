CREATE TABLE IF NOT EXISTS license_revocations (
  license_token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_expires_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL
);
