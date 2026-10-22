-- Ephemeral signature re-authentication, never archived.
CREATE TABLE iw_part11_challenges(envelope_id TEXT NOT NULL, signer INTEGER NOT NULL, token_hash TEXT NOT NULL, session_hash TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY(envelope_id,signer));
