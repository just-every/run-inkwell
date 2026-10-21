-- ADMIN-004 / SEND-001: versioned per-source send policies. Every save appends an immutable version that keeps the
-- settings it replaced; the current policy of a source is its highest version, and a source never saved uses the built-in
-- default (version 0). Only the account scope exists until groups and profiles ship (ADMIN-002, ADMIN-008).
CREATE TABLE iw_send_policy_versions (
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  mode TEXT NOT NULL CHECK(mode IN ('off','person','autonomous')),
  templates TEXT,
  require_internal_approval INTEGER NOT NULL CHECK(require_internal_approval IN (0,1)),
  deferred_release INTEGER NOT NULL CHECK(deferred_release IN (0,1)),
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  reason TEXT,
  before_value TEXT NOT NULL,
  PRIMARY KEY(scope,source,version),
  CHECK(source<>'ad_hoc' OR mode<>'autonomous')
);
CREATE TRIGGER iw_send_policy_versions_no_update BEFORE UPDATE ON iw_send_policy_versions BEGIN SELECT RAISE(ABORT,'Send policy versions are append-only'); END;
CREATE TRIGGER iw_send_policy_versions_no_delete BEFORE DELETE ON iw_send_policy_versions BEGIN SELECT RAISE(ABORT,'Send policy versions are append-only'); END;
