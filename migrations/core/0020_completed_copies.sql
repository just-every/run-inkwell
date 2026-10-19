-- DELIV-007: completed copies to every party. A secure link per recipient opens only after a code sent to that
-- mailbox; attachments go out when the account chose them and the files fit. Copy links and account settings are
-- installation state (not archived).
CREATE TABLE iw_copy_links (token_hash TEXT PRIMARY KEY, envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), party INTEGER NOT NULL, email TEXT NOT NULL, code_hash TEXT, code_expires INTEGER, code_attempts INTEGER NOT NULL DEFAULT 0, code_sent_at INTEGER, code_generation INTEGER NOT NULL DEFAULT 0, session_hash TEXT, session_expires INTEGER, UNIQUE(envelope_id, party));
CREATE TABLE iw_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
ALTER TABLE iw_mail ADD COLUMN attach INTEGER NOT NULL DEFAULT 0;
