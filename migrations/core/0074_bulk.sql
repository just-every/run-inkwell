CREATE TABLE iw_bulk_batches (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, template_id TEXT NOT NULL, template_data TEXT NOT NULL, rows_json TEXT NOT NULL, validation_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('preview','approved','held')), approved_at TEXT, policy_fingerprint TEXT);
CREATE TABLE iw_bulk_rows (batch_id TEXT NOT NULL, row_number INTEGER NOT NULL, envelope_id TEXT NOT NULL UNIQUE, PRIMARY KEY(batch_id,row_number));
CREATE TABLE iw_bulk_lists (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, rows_json TEXT NOT NULL);
