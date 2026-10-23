-- API-001 B3: one durable expiry-warning claim per key/expiry/threshold.
CREATE TABLE iw_api_key_warnings (
 id TEXT PRIMARY KEY, key_id TEXT NOT NULL, expires_at TEXT NOT NULL,
 days INTEGER NOT NULL CHECK(days IN (7,30)), state TEXT NOT NULL,
 claimed_at TEXT NOT NULL, finished_at TEXT, provider TEXT, provider_message_id TEXT,
 UNIQUE(key_id,expires_at,days)
);
