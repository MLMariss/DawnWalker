-- The build list. Run once against a fresh D1 database:
--   npx wrangler d1 execute dawnwalker-builds --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS builds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  author     TEXT    NOT NULL DEFAULT '',
  notes      TEXT    NOT NULL DEFAULT '',
  code       TEXT    NOT NULL,
  created    TEXT    NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0,
  -- The salted fingerprint of whoever posted it, for the daily cap. Not a
  -- name, not reversible to an address, and never sent to the page.
  author_key TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS builds_visible ON builds (hidden, created);
CREATE INDEX IF NOT EXISTS builds_code    ON builds (code);
CREATE INDEX IF NOT EXISTS builds_author  ON builds (author_key, created);

-- One row per vote, so the count cannot drift from the thing it counts and the
-- primary key is what stops a second vote.
CREATE TABLE IF NOT EXISTS votes (
  build_id INTEGER NOT NULL,
  voter    TEXT    NOT NULL,
  created  TEXT    NOT NULL,
  PRIMARY KEY (build_id, voter)
);

CREATE TABLE IF NOT EXISTS reports (
  build_id INTEGER NOT NULL,
  reporter TEXT    NOT NULL,
  created  TEXT    NOT NULL,
  PRIMARY KEY (build_id, reporter)
);
