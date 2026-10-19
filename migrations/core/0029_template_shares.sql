-- TMPL-002: shared folders that hold templates (a template with no folder is in its maker's personal folder), and shares
-- of a template or a folder with a member to use or to edit. Shares are installation state, like envelope shares.
CREATE TABLE iw_template_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE iw_templates ADD COLUMN folder_id TEXT;
CREATE TABLE iw_template_shares (subject TEXT NOT NULL CHECK(subject IN ('template','folder')), subject_id TEXT NOT NULL, operator_id TEXT NOT NULL, access TEXT NOT NULL CHECK(access IN ('use','edit')), granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, PRIMARY KEY(subject,subject_id,operator_id));
