CREATE TABLE iw_provider_auth (
  envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id) ON DELETE CASCADE,
  signer INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  generation INTEGER NOT NULL,
  reference TEXT,
  provider_session TEXT,
  sealed_token TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_at INTEGER NOT NULL,
  PRIMARY KEY (envelope_id, signer)
);
