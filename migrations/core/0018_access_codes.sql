-- IDV-003: a sender-set access code per recipient, entered before the document opens.
-- code_hash is keyed with the installation's SESSION_SECRET; the code itself is never stored.
-- passed_token is the link token hash the code was entered on, so a reissued link asks again.
CREATE TABLE IF NOT EXISTS iw_access_codes (
 envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), signer INTEGER NOT NULL,
 code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, passed_token TEXT,
 PRIMARY KEY(envelope_id,signer)
);
