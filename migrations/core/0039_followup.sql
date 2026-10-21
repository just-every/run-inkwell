-- Follow-up authorizations are not credentials. Private replies have their own read door.
CREATE TABLE iw_followup_grants(envelope_id TEXT NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL,member_id TEXT NOT NULL,member_version INTEGER NOT NULL,member_role TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(envelope_id,version));
CREATE TABLE iw_followup_states(envelope_id TEXT NOT NULL,signer INTEGER NOT NULL,identity TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(envelope_id,signer));
CREATE TABLE iw_followup_replies(id TEXT PRIMARY KEY,envelope_id TEXT NOT NULL,signer INTEGER NOT NULL,data TEXT NOT NULL);
CREATE TABLE iw_followup_capabilities(cap_hash TEXT PRIMARY KEY,envelope_id TEXT NOT NULL,signer INTEGER NOT NULL,token_hash TEXT NOT NULL,grant_version INTEGER NOT NULL);
CREATE TABLE iw_followup_receipts(event_id TEXT PRIMARY KEY,received_at TEXT NOT NULL);
ALTER TABLE iw_mail ADD COLUMN followup_version INTEGER;
ALTER TABLE iw_mail ADD COLUMN followup_envelope_version INTEGER;
CREATE TRIGGER iw_followup_member_changed AFTER UPDATE OF status,role,version ON oa_operators
WHEN NEW.status!=OLD.status OR NEW.role!=OLD.role OR NEW.version!=OLD.version BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.id AND state='active';
 UPDATE iw_mail SET state='cancelled',body='' WHERE state='pending' AND followup_version IS NOT NULL AND envelope_id IN (SELECT envelope_id FROM iw_followup_grants WHERE member_id=OLD.id AND state='suspended');
END;
CREATE TRIGGER iw_followup_member_removed BEFORE DELETE ON oa_operators BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.id AND state='active';
END;
CREATE TRIGGER iw_followup_role_narrowed AFTER UPDATE OF role ON iw_member_roles WHEN NEW.role='viewer' BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=NEW.operator_id AND state='active';
END;
CREATE TRIGGER iw_followup_role_removed AFTER DELETE ON iw_member_roles BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.operator_id AND state='active';
END;
CREATE TRIGGER iw_followup_share_removed AFTER DELETE ON iw_shares WHEN OLD.access='edit' BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.operator_id AND envelope_id=OLD.envelope_id AND member_role='sender' AND state='active' AND EXISTS(SELECT 1 FROM iw_envelopes WHERE id=OLD.envelope_id AND json_extract(data,'$.createdBy')!=OLD.operator_id);
END;
CREATE TRIGGER iw_followup_share_narrowed AFTER UPDATE OF access ON iw_shares WHEN OLD.access='edit' AND NEW.access!='edit' BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.operator_id AND envelope_id=OLD.envelope_id AND member_role='sender' AND state='active' AND EXISTS(SELECT 1 FROM iw_envelopes WHERE id=OLD.envelope_id AND json_extract(data,'$.createdBy')!=OLD.operator_id);
END;
CREATE TRIGGER iw_followup_closed AFTER UPDATE OF data ON iw_envelopes WHEN json_extract(NEW.data,'$.status')!='awaiting_signature' BEGIN
 UPDATE iw_followup_grants SET state='ended' WHERE envelope_id=NEW.id AND state='active';
 DELETE FROM iw_followup_capabilities WHERE envelope_id=NEW.id;
 UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=NEW.id AND state='pending' AND followup_version IS NOT NULL;
END;
CREATE TRIGGER iw_followup_drop_suspended_capabilities AFTER UPDATE OF state ON iw_followup_grants
WHEN NEW.state IN ('suspended','ended') BEGIN
 DELETE FROM iw_followup_capabilities WHERE envelope_id=NEW.envelope_id;
 UPDATE iw_mail SET state='cancelled',body='' WHERE envelope_id=NEW.envelope_id AND state='pending' AND followup_version IS NOT NULL;
END;
