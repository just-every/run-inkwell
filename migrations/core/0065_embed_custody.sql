-- Previously issued reusable launches cannot acquire the new consent authority.
DELETE FROM iw_embed_launches;
ALTER TABLE iw_embed_origins ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE iw_embed_origins ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iw_embed_launches ADD COLUMN grant_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iw_embed_launches ADD COLUMN member_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iw_embed_launches ADD COLUMN native_session TEXT;
ALTER TABLE iw_embed_launches ADD COLUMN recipient_hash TEXT;
ALTER TABLE iw_embed_launches ADD COLUMN session_id TEXT;
ALTER TABLE iw_embed_launches ADD COLUMN session_hash TEXT;
ALTER TABLE iw_embed_launches ADD COLUMN redeemed_at INTEGER;
ALTER TABLE iw_embed_launches ADD COLUMN allocation TEXT;
CREATE UNIQUE INDEX iw_embed_session ON iw_embed_launches(session_id);
ALTER TABLE iw_embed_audit ADD COLUMN envelope_id TEXT;
ALTER TABLE iw_embed_audit ADD COLUMN detail TEXT NOT NULL DEFAULT '{}';
CREATE TABLE iw_embed_rates(id TEXT PRIMARY KEY, stage TEXT NOT NULL, subject TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX iw_embed_rate_window ON iw_embed_rates(stage,at,subject);
