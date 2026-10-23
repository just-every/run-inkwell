-- ADMIN-008/API-001: the current self-service key permission. No grant means no self-service.
CREATE TABLE iw_api_key_permissions(member_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),version INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE iw_api_key_permission_versions(member_id TEXT NOT NULL,version INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,PRIMARY KEY(member_id,version));
CREATE TRIGGER iw_api_key_permission_versions_no_update BEFORE UPDATE ON iw_api_key_permission_versions BEGIN SELECT RAISE(ABORT,'immutable permission version'); END;
CREATE TRIGGER iw_api_key_permission_versions_no_delete BEFORE DELETE ON iw_api_key_permission_versions BEGIN SELECT RAISE(ABORT,'immutable permission version'); END;
CREATE TRIGGER iw_api_key_permission_lost AFTER UPDATE OF enabled ON iw_api_key_permissions WHEN OLD.enabled=1 AND NEW.enabled=0
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.member_id; END;
CREATE TRIGGER iw_api_key_permission_removed AFTER DELETE ON iw_api_key_permissions WHEN OLD.enabled=1
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.member_id; END;
