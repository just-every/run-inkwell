-- FORM-001: atomic counters are separate from short-lived admission/rate-limit identifiers.
ALTER TABLE iw_forms ADD COLUMN total_count INTEGER NOT NULL DEFAULT 0;
CREATE TABLE iw_form_daily_counts(form_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(form_id,day));
CREATE TABLE iw_form_submissions(challenge_id TEXT PRIMARY KEY,form_id TEXT NOT NULL,envelope_id TEXT NOT NULL,at INTEGER NOT NULL,email_hash TEXT NOT NULL,ip_hash TEXT);
CREATE INDEX iw_form_submissions_email ON iw_form_submissions(form_id,email_hash,at);
CREATE INDEX iw_form_submissions_ip ON iw_form_submissions(ip_hash,at);
