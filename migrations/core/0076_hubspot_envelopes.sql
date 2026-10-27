-- INTEG-001: selected-record authority and write-back progress stay in this installation.
CREATE TABLE iw_hubspot_send_bindings (
 id TEXT PRIMARY KEY, credential_version INTEGER NOT NULL, account_id TEXT NOT NULL,
 principal TEXT NOT NULL, member_version INTEGER NOT NULL, member_role TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE iw_hubspot_envelopes (
 envelope_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, record_type TEXT NOT NULL,
 record_id TEXT NOT NULL, credential_version INTEGER NOT NULL, principal TEXT NOT NULL,
 member_version INTEGER NOT NULL, authorized_at TEXT NOT NULL, scope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'waiting', properties_done INTEGER NOT NULL DEFAULT 0,
 file_id TEXT, note_id TEXT, uncertain TEXT, lease TEXT, lease_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, completed_at TEXT
);
CREATE TRIGGER iw_hubspot_send_member_lost AFTER UPDATE OF status,role,version ON oa_operators
WHEN NEW.status<>'active' OR NEW.role<>OLD.role OR NEW.version<>OLD.version
BEGIN UPDATE iw_hubspot_send_bindings SET active=0 WHERE principal=NEW.id; END;
CREATE TRIGGER iw_hubspot_send_member_deleted AFTER DELETE ON oa_operators
BEGIN UPDATE iw_hubspot_send_bindings SET active=0 WHERE principal=OLD.id; END;
CREATE TRIGGER iw_hubspot_send_credential_lost AFTER UPDATE ON iw_hubspot_credentials
WHEN NEW.version<>OLD.version OR NEW.active=0
BEGIN UPDATE iw_hubspot_send_bindings SET active=0; END;
