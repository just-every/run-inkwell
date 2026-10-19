-- RECORD-005: what each retention purge erased, kept without the envelope's title or parties: the envelope ID, the rule
-- in years and the completed, warned and purged times. The account rule itself is iw_settings' retention_years.
CREATE TABLE iw_retention_purges (envelope_id TEXT PRIMARY KEY, years INTEGER NOT NULL, completed_at TEXT NOT NULL, warned_at TEXT NOT NULL, purged_at TEXT NOT NULL);
