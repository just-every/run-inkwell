-- Identity verification and qualification records are business records; secrets/sessions are installation-only.
CREATE TABLE iw_part11_identities (
 operator_id TEXT PRIMARY KEY, operator_version INTEGER NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
 method TEXT NOT NULL, verified_by TEXT NOT NULL, verified_at TEXT NOT NULL, version INTEGER NOT NULL,
 activation_hash TEXT, activation_expires INTEGER, salt TEXT, password_hash TEXT, activated_at TEXT
);
CREATE TABLE iw_part11_sessions (
 token_hash TEXT PRIMARY KEY, operator_id TEXT NOT NULL, identity_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE iw_part11_password_attempts (
 operator_id TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TABLE iw_part11_records (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('identity','meaning','fda-certification')),
 actor TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TRIGGER iw_part11_records_no_update BEFORE UPDATE ON iw_part11_records BEGIN SELECT RAISE(ABORT,'append_only'); END;
CREATE TRIGGER iw_part11_records_no_delete BEFORE DELETE ON iw_part11_records BEGIN SELECT RAISE(ABORT,'append_only'); END;
CREATE TABLE iw_part11_security_alerts (
 id TEXT PRIMARY KEY, envelope_id TEXT NOT NULL, signer INTEGER NOT NULL, cause TEXT NOT NULL,
 at TEXT NOT NULL, contacts TEXT NOT NULL, UNIQUE(envelope_id,signer,cause)
);
