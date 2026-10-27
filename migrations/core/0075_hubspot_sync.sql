-- INTEG-001: connector authority and progress are installation state, excluded from archives.
CREATE TABLE iw_hubspot_credentials(id TEXT PRIMARY KEY,version INTEGER NOT NULL,account_id TEXT NOT NULL,token_hash TEXT NOT NULL,active INTEGER NOT NULL);
CREATE TABLE iw_hubspot_authorizations(id TEXT PRIMARY KEY,version INTEGER NOT NULL UNIQUE,authorizer TEXT NOT NULL,member_version INTEGER NOT NULL,credential_version INTEGER NOT NULL,account_id TEXT NOT NULL,definition TEXT NOT NULL,authorized_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active',next_run_at INTEGER,stop_reason TEXT);
CREATE TABLE iw_hubspot_runs(id TEXT PRIMARY KEY,authorization_id TEXT NOT NULL,version INTEGER NOT NULL,request_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,cursor TEXT,pages INTEGER NOT NULL DEFAULT 0,records INTEGER NOT NULL DEFAULT 0,applied INTEGER NOT NULL DEFAULT 0,conflicts INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,error TEXT,lease TEXT,lease_at INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX iw_hubspot_active_run ON iw_hubspot_runs(authorization_id) WHERE status IN('ready','reading','failed');
CREATE TABLE iw_hubspot_sources(account_id TEXT NOT NULL,record_id TEXT NOT NULL,email TEXT NOT NULL,contact_json TEXT NOT NULL,ignored_hash TEXT,PRIMARY KEY(account_id,record_id),UNIQUE(account_id,email));
CREATE TABLE iw_hubspot_conflicts(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,record_id TEXT NOT NULL,run_id TEXT NOT NULL,contact_json TEXT NOT NULL,local_email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',UNIQUE(account_id,record_id));
CREATE TABLE iw_hubspot_sync_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,authorization_id TEXT,version INTEGER,scope TEXT,run_id TEXT,outcome TEXT NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER iw_hubspot_definition_immutable BEFORE UPDATE OF id,version,authorizer,member_version,credential_version,account_id,definition,authorized_at ON iw_hubspot_authorizations BEGIN SELECT RAISE(ABORT,'Immutable HubSpot authorization'); END;
CREATE TRIGGER iw_hubspot_audit_immutable_update BEFORE UPDATE ON iw_hubspot_sync_audit BEGIN SELECT RAISE(ABORT,'Immutable HubSpot audit'); END;
CREATE TRIGGER iw_hubspot_audit_immutable_delete BEFORE DELETE ON iw_hubspot_sync_audit BEGIN SELECT RAISE(ABORT,'Immutable HubSpot audit'); END;
CREATE TRIGGER iw_hubspot_authority_lost AFTER UPDATE OF status,role,version ON oa_operators WHEN NEW.status<>'active' OR NEW.role<>OLD.role OR NEW.version<>OLD.version
BEGIN UPDATE iw_hubspot_authorizations SET state='revoked',stop_reason='Authorizing member authority changed' WHERE authorizer=NEW.id AND state='active'; END;
CREATE TRIGGER iw_hubspot_authorizer_deleted AFTER DELETE ON oa_operators
BEGIN UPDATE iw_hubspot_authorizations SET state='revoked',stop_reason='Authorizing member removed' WHERE authorizer=OLD.id AND state='active'; END;
CREATE TRIGGER iw_hubspot_credential_lost AFTER UPDATE ON iw_hubspot_credentials WHEN NEW.version<>OLD.version OR NEW.active=0
BEGIN UPDATE iw_hubspot_authorizations SET state='revoked',stop_reason='Connector credential changed' WHERE state='active'; END;
CREATE TRIGGER iw_hubspot_credential_deleted AFTER DELETE ON iw_hubspot_credentials
BEGIN UPDATE iw_hubspot_authorizations SET state='revoked',stop_reason='Connector credential removed' WHERE state='active'; END;
CREATE TRIGGER iw_hubspot_authorization_stopped AFTER UPDATE OF state ON iw_hubspot_authorizations WHEN NEW.state<>'active'
BEGIN
 UPDATE iw_hubspot_runs SET status='stopped',error=NEW.stop_reason,lease=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE authorization_id=NEW.id AND status IN('ready','reading','failed');
 INSERT INTO iw_hubspot_sync_audit(id,actor,action,authorization_id,version,scope,run_id,outcome,at) VALUES(lower(hex(randomblob(16))),'system:hubspot','hubspot.authorization.stopped',NEW.id,NEW.version,NEW.definition,NULL,NEW.stop_reason,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'system:hubspot','hubspot.authorization.stopped','hubspot:'||NEW.id,NULL,json_object('version',NEW.version,'scope',json(NEW.definition),'outcome',NEW.stop_reason));
END;
