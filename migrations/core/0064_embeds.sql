CREATE TABLE iw_embed_origins (origin TEXT PRIMARY KEY, actor TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE iw_embed_launches (
 token_hash TEXT PRIMARY KEY, origin TEXT NOT NULL, mode TEXT NOT NULL,
 sealed TEXT NOT NULL, expires_at INTEGER NOT NULL, envelope_id TEXT,
 actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE iw_embed_audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, origin TEXT NOT NULL, at TEXT NOT NULL);
