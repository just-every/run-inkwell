-- API-001: credentials belong to this installation, never its document archives.
-- The token is revealed only by the successful mint/rotate response; receipts hold metadata only.
CREATE TABLE iw_api_keys (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, member_id TEXT NOT NULL,
 member_version INTEGER NOT NULL, member_role TEXT NOT NULL CHECK(member_role IN ('owner','admin','sender')),
 token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, last_four TEXT NOT NULL,
 scopes TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
 expires_at TEXT NOT NULL, revoked_at TEXT, suspended_at TEXT,
 rotated_to TEXT, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX iw_api_keys_member ON iw_api_keys(member_id);
-- Remember authority loss when it happens, even if nobody calls the key until after restoration.
CREATE TRIGGER iw_api_keys_member_changed AFTER UPDATE OF status,role,version ON oa_operators
WHEN NEW.status<>'active' OR NEW.role<>OLD.role OR NEW.version<>OLD.version
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.id; END;
CREATE TRIGGER iw_api_keys_member_deleted AFTER DELETE ON oa_operators
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.id; END;
CREATE TRIGGER iw_api_keys_sender_narrowed AFTER UPDATE OF role ON iw_member_roles
WHEN OLD.role='sender' AND NEW.role<>'sender'
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_sender_removed AFTER DELETE ON iw_member_roles WHEN OLD.role='sender'
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_share_narrowed AFTER UPDATE OF access ON iw_shares WHEN OLD.access='edit' AND NEW.access='view'
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_share_removed AFTER DELETE ON iw_shares
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_template_share_narrowed AFTER UPDATE OF access ON iw_template_shares WHEN OLD.access='edit' AND NEW.access='use'
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_template_share_removed AFTER DELETE ON iw_template_shares
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.operator_id AND member_role='sender'; END;
