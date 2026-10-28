CREATE TABLE iw_microsoft_uploads (
 upload_id TEXT PRIMARY KEY REFERENCES iw_pdf_uploads(id) ON DELETE CASCADE,
 data TEXT NOT NULL
);
-- Preserve existing rules while extending the provider set.
CREATE TABLE iw_filing_rules_next (
 template_id TEXT NOT NULL REFERENCES iw_templates(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('box','dropbox','sharepoint')),
 folder TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
 folder_ref TEXT,
 PRIMARY KEY(template_id,provider)
);
INSERT INTO iw_filing_rules_next(template_id,provider,folder,enabled,version,actor,at,folder_ref)
 SELECT template_id,provider,folder,enabled,version,actor,at,folder_ref FROM iw_filing_rules;
DROP TABLE iw_filing_rules;
ALTER TABLE iw_filing_rules_next RENAME TO iw_filing_rules;
