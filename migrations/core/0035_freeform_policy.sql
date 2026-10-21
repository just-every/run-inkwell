-- PREP-011: account-wide default and permanent history of actual changes.
CREATE TABLE iw_freeform_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL CHECK(version>=0),
  actor TEXT,
  at TEXT
);
INSERT INTO iw_freeform_policy(id,enabled,version) VALUES(1,0,0);
CREATE TABLE iw_freeform_history (
  version INTEGER PRIMARY KEY CHECK(version>0),
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  before_value INTEGER NOT NULL CHECK(before_value IN (0,1)),
  after_value INTEGER NOT NULL CHECK(after_value IN (0,1) AND after_value<>before_value)
);
CREATE TRIGGER iw_freeform_history_no_update BEFORE UPDATE ON iw_freeform_history BEGIN SELECT RAISE(ABORT,'Free-form setting history is append-only'); END;
CREATE TRIGGER iw_freeform_history_no_delete BEFORE DELETE ON iw_freeform_history BEGIN SELECT RAISE(ABORT,'Free-form setting history is append-only'); END;
