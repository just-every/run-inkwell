-- API-001 B7: rolling admission windows and a 24-hour API command receipt lifetime.
CREATE TABLE iw_api_request_events (id TEXT PRIMARY KEY, key_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX iw_api_request_window ON iw_api_request_events(key_id,at);
CREATE TABLE iw_policy_send_usage (envelope_id TEXT PRIMARY KEY, source TEXT NOT NULL, credential_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX iw_policy_send_account_window ON iw_policy_send_usage(at);
CREATE INDEX iw_policy_send_key_window ON iw_policy_send_usage(credential_id,at);
ALTER TABLE iw_commands ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE iw_commands SET created_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE created_at=0;
