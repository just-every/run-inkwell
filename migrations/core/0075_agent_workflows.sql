-- Active grants and capabilities never travel in an archive.
CREATE TABLE iw_agent_work_caps(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,envelope_id TEXT,kind TEXT NOT NULL,data TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active');
-- Questions and received sources are business custody, with no active capability.
CREATE TABLE iw_agent_requests(id TEXT PRIMARY KEY,envelope_id TEXT NOT NULL,data TEXT NOT NULL,state TEXT NOT NULL);
CREATE TABLE iw_agent_inbound(envelope_id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE iw_agent_work_receipts(provider_message_id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,received_at TEXT NOT NULL);
CREATE TRIGGER iw_agent_work_member_changed AFTER UPDATE OF status,role,version ON oa_operators
WHEN NEW.status!=OLD.status OR NEW.role!=OLD.role OR NEW.version!=OLD.version BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND (json_extract(data,'$.actor.id')=OLD.id OR json_extract(data,'$.member.id')=OLD.id);
END;
CREATE TRIGGER iw_agent_work_member_removed BEFORE DELETE ON oa_operators BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND (json_extract(data,'$.actor.id')=OLD.id OR json_extract(data,'$.member.id')=OLD.id);
END;
CREATE TRIGGER iw_agent_work_role_narrowed AFTER UPDATE OF role ON iw_member_roles WHEN NEW.role='viewer' BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND (json_extract(data,'$.actor.id')=NEW.operator_id OR json_extract(data,'$.member.id')=NEW.operator_id);
END;
CREATE TRIGGER iw_agent_work_role_removed AFTER DELETE ON iw_member_roles BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND (json_extract(data,'$.actor.id')=OLD.operator_id OR json_extract(data,'$.member.id')=OLD.operator_id);
END;
CREATE TRIGGER iw_agent_work_share_removed AFTER DELETE ON iw_shares WHEN OLD.access='edit' BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND envelope_id=OLD.envelope_id AND json_extract(data,'$.actor.id')=OLD.operator_id AND json_extract(data,'$.actor.role')='sender' AND EXISTS(SELECT 1 FROM iw_envelopes WHERE id=OLD.envelope_id AND json_extract(data,'$.createdBy')!=OLD.operator_id);
END;
CREATE TRIGGER iw_agent_work_share_narrowed AFTER UPDATE OF access ON iw_shares WHEN OLD.access='edit' AND NEW.access!='edit' BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND envelope_id=OLD.envelope_id AND json_extract(data,'$.actor.id')=OLD.operator_id AND json_extract(data,'$.actor.role')='sender' AND EXISTS(SELECT 1 FROM iw_envelopes WHERE id=OLD.envelope_id AND json_extract(data,'$.createdBy')!=OLD.operator_id);
END;
CREATE TRIGGER iw_agent_work_draft_closed AFTER UPDATE OF data ON iw_envelopes WHEN json_extract(NEW.data,'$.status')!='prepared' BEGIN
 UPDATE iw_agent_work_caps SET state='ended' WHERE envelope_id=NEW.id AND kind='information' AND state='active';
END;
-- Fixed opaque references only: no question, reply, header, title or capability.
CREATE TRIGGER iw_agent_work_event AFTER INSERT ON iw_events WHEN json_extract(NEW.data,'$.action') IN ('agent.information_requested','agent.information_merged','agent.material_change_flagged','agent.inbound_prepared','agent.inbound_return_claimed') BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),json_extract(NEW.data,'$.at'),json_extract(NEW.data,'$.actor'),json_extract(NEW.data,'$.action'),'envelope:'||NEW.envelope_id,NULL,json_object('sequence',NEW.sequence,'requestId',json_extract(NEW.data,'$.detail.request'),'replyId',json_extract(NEW.data,'$.detail.reply')));
END;
CREATE TRIGGER iw_agent_work_folder_removed AFTER DELETE ON iw_envelope_folder_shares WHEN OLD.access='edit' BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND kind='information' AND json_extract(data,'$.actor.id')=OLD.operator_id AND json_extract(data,'$.actor.role')='sender' AND envelope_id IN (SELECT id FROM iw_envelopes WHERE json_extract(data,'$.folderId')=OLD.folder_id AND json_extract(data,'$.createdBy')!=OLD.operator_id) AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=iw_agent_work_caps.envelope_id AND s.operator_id=OLD.operator_id AND s.access='edit');
END;
CREATE TRIGGER iw_agent_work_folder_narrowed AFTER UPDATE OF access ON iw_envelope_folder_shares WHEN OLD.access='edit' AND NEW.access!='edit' BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND kind='information' AND json_extract(data,'$.actor.id')=NEW.operator_id AND json_extract(data,'$.actor.role')='sender' AND envelope_id IN (SELECT id FROM iw_envelopes WHERE json_extract(data,'$.folderId')=NEW.folder_id AND json_extract(data,'$.createdBy')!=NEW.operator_id) AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=iw_agent_work_caps.envelope_id AND s.operator_id=NEW.operator_id AND s.access='edit');
END;
CREATE TRIGGER iw_agent_work_folder_moved AFTER UPDATE OF data ON iw_envelopes WHEN json_extract(OLD.data,'$.folderId') IS NOT json_extract(NEW.data,'$.folderId') BEGIN
 UPDATE iw_agent_work_caps SET state='suspended' WHERE state='active' AND kind='information' AND envelope_id=NEW.id AND json_extract(data,'$.actor.role')='sender' AND json_extract(data,'$.actor.id')!=json_extract(NEW.data,'$.createdBy') AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=NEW.id AND s.operator_id=json_extract(iw_agent_work_caps.data,'$.actor.id') AND s.access='edit');
END;
CREATE TRIGGER iw_agent_work_granted AFTER INSERT ON iw_agent_work_caps WHEN NEW.kind='inbound' BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),json_extract(NEW.data,'$.at'),json_extract(NEW.data,'$.actor.id'),'agent.inbound_granted','inbound-grant:'||NEW.id,NULL,json_object('memberId',json_extract(NEW.data,'$.member.id'),'allowReturn',json_extract(NEW.data,'$.allowReturn'),'state',NEW.state));
END;
CREATE TRIGGER iw_agent_work_revoked AFTER UPDATE OF state ON iw_agent_work_caps WHEN NEW.kind='inbound' AND NEW.state!=OLD.state BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'system'),'agent.inbound_authority_changed','inbound-grant:'||NEW.id,json_object('state',OLD.state),json_object('state',NEW.state));
END;
CREATE TABLE iw_agent_attachments(id TEXT PRIMARY KEY,envelope_id TEXT NOT NULL,data TEXT NOT NULL);
