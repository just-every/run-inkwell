CREATE TABLE iw_filing_rules (
 template_id TEXT NOT NULL REFERENCES iw_templates(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('box','dropbox')),
 folder TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL,
 actor TEXT NOT NULL,
 at TEXT NOT NULL,
 PRIMARY KEY(template_id,provider)
);
CREATE TABLE iw_filing_history (
 id TEXT PRIMARY KEY, template_id TEXT NOT NULL, provider TEXT NOT NULL,
 actor TEXT NOT NULL, at TEXT NOT NULL, consent TEXT NOT NULL, before_value TEXT, after_value TEXT NOT NULL
);
CREATE TABLE iw_filing_jobs (
 envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, folder TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('signed','certificate')),
 sha256 TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','filed','uncertain','cancelled')),
 claim TEXT, started_at INTEGER, remote_id TEXT, filed_at TEXT,
 PRIMARY KEY(envelope_id,provider,folder,kind)
);
