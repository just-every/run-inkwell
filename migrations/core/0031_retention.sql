-- RECORD-005: what each retention purge erased, kept without the envelope's title or parties: the envelope ID, how it
-- ended (completed, declined, voided or expired), the rule in years and the ended, warned and purged times. The account
-- rule itself is iw_settings' retention_years.
CREATE TABLE iw_retention_purges (envelope_id TEXT PRIMARY KEY, ended TEXT NOT NULL, years INTEGER NOT NULL, ended_at TEXT NOT NULL, warned_at TEXT NOT NULL, purged_at TEXT NOT NULL);
