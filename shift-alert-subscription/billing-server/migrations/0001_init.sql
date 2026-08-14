CREATE TABLE IF NOT EXISTS licenses (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  payment_link_id TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seen_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
