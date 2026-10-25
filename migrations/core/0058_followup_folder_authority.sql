-- Effective folder authority is checked at every action; loss also permanently suspends the grant.
CREATE TRIGGER iw_followup_folder_share_removed AFTER DELETE ON iw_envelope_folder_shares WHEN OLD.access='edit' BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=OLD.operator_id AND member_role='sender' AND state='active'
 AND envelope_id IN (SELECT id FROM iw_envelopes WHERE json_extract(data,'$.folderId')=OLD.folder_id AND json_extract(data,'$.createdBy')!=OLD.operator_id)
 AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=iw_followup_grants.envelope_id AND s.operator_id=OLD.operator_id AND s.access='edit');
END;
CREATE TRIGGER iw_followup_folder_share_narrowed AFTER UPDATE OF access ON iw_envelope_folder_shares WHEN OLD.access='edit' AND NEW.access!='edit' BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE member_id=NEW.operator_id AND member_role='sender' AND state='active'
 AND envelope_id IN (SELECT id FROM iw_envelopes WHERE json_extract(data,'$.folderId')=NEW.folder_id AND json_extract(data,'$.createdBy')!=NEW.operator_id)
 AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=iw_followup_grants.envelope_id AND s.operator_id=NEW.operator_id AND s.access='edit');
END;
CREATE TRIGGER iw_followup_folder_moved AFTER UPDATE OF data ON iw_envelopes
WHEN json_extract(OLD.data,'$.folderId') IS NOT NULL AND json_extract(OLD.data,'$.folderId') IS NOT json_extract(NEW.data,'$.folderId') BEGIN
 UPDATE iw_followup_grants SET state='suspended' WHERE envelope_id=NEW.id AND member_role='sender' AND state='active' AND member_id!=json_extract(NEW.data,'$.createdBy')
 AND NOT EXISTS(SELECT 1 FROM iw_effective_shares s WHERE s.envelope_id=NEW.id AND s.operator_id=iw_followup_grants.member_id AND s.access='edit');
END;
