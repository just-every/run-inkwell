-- Proposed moved-file repairs never grant authority without native owner approval.
ALTER TABLE iw_hubspot_envelopes ADD COLUMN file_repair_json TEXT;
