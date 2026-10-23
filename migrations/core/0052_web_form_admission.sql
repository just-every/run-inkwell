-- FORM-001: publication and verified-email admission belong to this installation.
CREATE TABLE iw_form_permissions(member_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),version INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE iw_form_permission_versions(member_id TEXT NOT NULL,version INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,PRIMARY KEY(member_id,version));
CREATE TRIGGER iw_form_permission_versions_no_update BEFORE UPDATE ON iw_form_permission_versions BEGIN SELECT RAISE(ABORT,'immutable form permission'); END;
CREATE TRIGGER iw_form_permission_versions_no_delete BEFORE DELETE ON iw_form_permission_versions BEGIN SELECT RAISE(ABORT,'immutable form permission'); END;
CREATE TABLE iw_forms(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,owner_version INTEGER NOT NULL,owner_role TEXT NOT NULL,template_id TEXT NOT NULL,template_version INTEGER NOT NULL,template_hash TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,disabled_at TEXT,suspended_at TEXT);
CREATE INDEX iw_forms_owner ON iw_forms(owner_id);
CREATE TABLE iw_form_versions(id TEXT PRIMARY KEY,actor TEXT NOT NULL,at TEXT NOT NULL,data TEXT NOT NULL);
CREATE TRIGGER iw_form_versions_no_update BEFORE UPDATE ON iw_form_versions BEGIN SELECT RAISE(ABORT,'immutable form version'); END;
CREATE TRIGGER iw_form_versions_no_delete BEFORE DELETE ON iw_form_versions BEGIN SELECT RAISE(ABORT,'immutable form version'); END;
CREATE TABLE iw_form_challenges(id TEXT PRIMARY KEY,form_id TEXT NOT NULL,email TEXT NOT NULL,email_hash TEXT NOT NULL,code_hash TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,verified_at INTEGER,grant_hash TEXT,grant_expires INTEGER,mail_state TEXT NOT NULL DEFAULT 'sending');
CREATE INDEX iw_form_challenges_email ON iw_form_challenges(form_id,email_hash,created_at);
CREATE TRIGGER iw_forms_owner_changed AFTER UPDATE OF status,role,version ON oa_operators WHEN NEW.status<>'active' OR NEW.role<>OLD.role OR NEW.version<>OLD.version
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=NEW.id; END;
CREATE TRIGGER iw_forms_owner_deleted AFTER DELETE ON oa_operators
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=OLD.id; END;
CREATE TRIGGER iw_forms_sender_narrowed AFTER UPDATE OF role ON iw_member_roles WHEN OLD.role='sender' AND NEW.role<>'sender'
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=NEW.operator_id; END;
CREATE TRIGGER iw_forms_sender_removed AFTER DELETE ON iw_member_roles WHEN OLD.role='sender'
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=OLD.operator_id; END;
CREATE TRIGGER iw_forms_permission_lost AFTER UPDATE OF enabled ON iw_form_permissions WHEN OLD.enabled=1 AND NEW.enabled=0
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=NEW.member_id; END;
CREATE TRIGGER iw_forms_permission_removed AFTER DELETE ON iw_form_permissions WHEN OLD.enabled=1
BEGIN UPDATE iw_forms SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE owner_id=OLD.member_id; END;
