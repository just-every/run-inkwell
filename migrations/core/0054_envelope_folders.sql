CREATE TABLE iw_envelope_folders(id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, version INTEGER NOT NULL, retention_years INTEGER, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE iw_envelope_folder_shares(folder_id TEXT NOT NULL REFERENCES iw_envelope_folders(id), operator_id TEXT NOT NULL, access TEXT NOT NULL CHECK(access IN ('view','edit')), PRIMARY KEY(folder_id,operator_id));
CREATE TABLE iw_envelope_folder_events(id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
CREATE VIEW iw_effective_shares AS SELECT envelope_id,operator_id,CASE WHEN max(edit)=1 THEN 'edit' ELSE 'view' END AS access FROM (
 SELECT envelope_id,operator_id,access='edit' AS edit FROM iw_shares
 UNION ALL SELECT e.id,s.operator_id,s.access='edit' FROM iw_envelopes e JOIN iw_envelope_folder_shares s ON s.folder_id=json_extract(e.data,'$.folderId')
 UNION ALL SELECT e.id,f.owner_id,1 FROM iw_envelopes e JOIN iw_envelope_folders f ON f.id=json_extract(e.data,'$.folderId')
) GROUP BY envelope_id,operator_id;
CREATE TRIGGER iw_api_keys_folder_share_narrowed AFTER UPDATE OF access ON iw_envelope_folder_shares WHEN OLD.access='edit' AND NEW.access='view'
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=NEW.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_folder_share_removed AFTER DELETE ON iw_envelope_folder_shares
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_id=OLD.operator_id AND member_role='sender'; END;
CREATE TRIGGER iw_api_keys_folder_moved AFTER UPDATE OF data ON iw_envelopes WHEN json_extract(OLD.data,'$.folderId') IS NOT NULL AND json_extract(OLD.data,'$.folderId') IS NOT json_extract(NEW.data,'$.folderId')
BEGIN UPDATE iw_api_keys SET suspended_at=COALESCE(suspended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE member_role='sender' AND member_id IN (SELECT operator_id FROM iw_envelope_folder_shares WHERE folder_id=json_extract(OLD.data,'$.folderId') UNION SELECT owner_id FROM iw_envelope_folders WHERE id=json_extract(OLD.data,'$.folderId')); END;
