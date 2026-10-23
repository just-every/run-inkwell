-- ADMIN-004: member-group/profile send constraints grant no capabilities or document access.
CREATE TABLE iw_send_policy_scopes (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('group','profile')), name TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE UNIQUE INDEX iw_send_policy_scope_name ON iw_send_policy_scopes(kind,lower(name));
CREATE TABLE iw_send_policy_scope_versions (id TEXT NOT NULL, version INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, before_value TEXT, after_value TEXT NOT NULL, PRIMARY KEY(id,version));
CREATE TRIGGER iw_send_policy_scope_history_no_update BEFORE UPDATE ON iw_send_policy_scope_versions BEGIN SELECT RAISE(ABORT,'Send scope history is append-only'); END;
CREATE TRIGGER iw_send_policy_scope_history_no_delete BEFORE DELETE ON iw_send_policy_scope_versions BEGIN SELECT RAISE(ABORT,'Send scope history is append-only'); END;
