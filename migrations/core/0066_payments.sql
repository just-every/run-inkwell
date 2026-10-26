CREATE TABLE iw_payments (
 id TEXT PRIMARY KEY, envelope_id TEXT NOT NULL, signer INTEGER NOT NULL,
 token_hash TEXT NOT NULL, requirement_hash TEXT NOT NULL,
 checkout_reference TEXT, sealed_url TEXT, receipt TEXT, consumed_at TEXT,
 UNIQUE(envelope_id,signer,token_hash,requirement_hash)
);
