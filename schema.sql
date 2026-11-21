CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  when_text TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  target INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  creator_id TEXT NOT NULL,
  tipped_at INTEGER,
  tipped_count INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT,
  cond_min INTEGER,
  cond_names TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS members_plan_name ON members(plan_id, name_key);
CREATE INDEX IF NOT EXISTS members_token ON members(token_hash);
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
