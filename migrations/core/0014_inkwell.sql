-- Inkwell records are installation-local. All signing credentials remain hashed.
CREATE TABLE iw_envelopes (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE iw_blobs (envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), kind TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL CHECK(length(data)<102400), PRIMARY KEY(envelope_id,kind,part));
CREATE TABLE iw_events (envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), sequence INTEGER NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(envelope_id,sequence));
CREATE TRIGGER iw_events_no_update BEFORE UPDATE ON iw_events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
CREATE TABLE iw_guards (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE iw_commands (actor TEXT NOT NULL, command_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(actor,command_id));
CREATE TABLE iw_signers (envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), signer INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, code_hash TEXT, code_expires INTEGER, code_attempts INTEGER NOT NULL DEFAULT 0, code_sent_at INTEGER, code_generation INTEGER NOT NULL DEFAULT 0, session_hash TEXT, session_expires INTEGER, PRIMARY KEY(envelope_id,signer));
CREATE TABLE iw_agents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner_version INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE iw_mail (id TEXT PRIMARY KEY, envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), signer INTEGER NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
