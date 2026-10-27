-- CRM bindings and sync consent are installation state. Archives cannot activate a connector.
CREATE TABLE iw_hubspot_drafts (
 envelope_id TEXT PRIMARY KEY REFERENCES iw_envelopes(id) ON DELETE CASCADE,
 object_type TEXT NOT NULL CHECK(object_type IN ('deals','contacts')),
 record_id TEXT NOT NULL,
 escalation_owner TEXT
);
CREATE TABLE iw_hubspot_syncs (actor TEXT NOT NULL, at TEXT NOT NULL, consent TEXT NOT NULL, count INTEGER NOT NULL);

CREATE TRIGGER iw_hubspot_sync_no_update BEFORE UPDATE ON iw_hubspot_syncs BEGIN SELECT RAISE(ABORT,'CRM consent history is append only'); END;
CREATE TRIGGER iw_hubspot_sync_no_delete BEFORE DELETE ON iw_hubspot_syncs BEGIN SELECT RAISE(ABORT,'CRM consent history is append only'); END;
CREATE TRIGGER iw_audit_hubspot_sync AFTER INSERT ON iw_hubspot_syncs BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),NEW.at,NEW.actor,'hubspot.contacts_synced','integration:hubspot',NULL,json_object('count',NEW.count,'consentVersion','hubspot-import-2026-10-27'));
END;
CREATE TRIGGER iw_audit_hubspot_prepare AFTER INSERT ON iw_events
WHEN json_extract(NEW.data,'$.action')='hubspot.prepared'
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),json_extract(NEW.data,'$.at'),json_extract(NEW.data,'$.actor'),'hubspot.prepared','envelope:'||NEW.envelope_id,NULL,json_object('objectType',json_extract(NEW.data,'$.detail.objectType'),'recordId',json_extract(NEW.data,'$.detail.recordId'),'escalationOwner',json_extract(NEW.data,'$.detail.escalationOwner'),'consentVersion','hubspot-prepare-2026-10-27'));
END;
