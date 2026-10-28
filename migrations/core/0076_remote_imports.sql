-- Reviewed API batches are temporary installation state, never restored outbound authority.
CREATE TABLE iw_remote_previews (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
-- Stable opaque identities prevent retries and erased source records from creating duplicates.
CREATE TABLE iw_remote_imports (id TEXT PRIMARY KEY, kind TEXT NOT NULL);
CREATE TABLE iw_remote_preview_parts (preview_id TEXT NOT NULL REFERENCES iw_remote_previews(id) ON DELETE CASCADE, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(preview_id,part));
