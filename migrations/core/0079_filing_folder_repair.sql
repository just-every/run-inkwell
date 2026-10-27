-- Stable folder identity permits owner-reviewed path repair without a new destination.
ALTER TABLE iw_filing_rules ADD COLUMN folder_ref TEXT;
ALTER TABLE iw_filing_jobs ADD COLUMN folder_ref TEXT;
ALTER TABLE iw_filing_jobs ADD COLUMN resolved_folder TEXT;
ALTER TABLE iw_filing_jobs ADD COLUMN folder_repair_json TEXT;
