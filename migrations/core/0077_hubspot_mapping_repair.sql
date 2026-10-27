-- Mapping repairs are installation authority, excluded with connector state from archives.
ALTER TABLE iw_hubspot_envelopes ADD COLUMN mapping_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE iw_hubspot_envelopes ADD COLUMN repair_json TEXT;
