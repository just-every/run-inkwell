PRAGMA foreign_keys=OFF;
CREATE TABLE iw_filing_rules_google (
 template_id TEXT NOT NULL REFERENCES iw_templates(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('box','dropbox','google')),
 folder TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
 PRIMARY KEY(template_id,provider)
);
INSERT INTO iw_filing_rules_google SELECT * FROM iw_filing_rules;
DROP TABLE iw_filing_rules;
ALTER TABLE iw_filing_rules_google RENAME TO iw_filing_rules;
PRAGMA foreign_keys=ON;
