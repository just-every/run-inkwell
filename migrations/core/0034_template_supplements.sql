-- SIGNX-009: reusable supplemental PDFs retain independent, fingerprinted template custody.
CREATE TABLE iw_template_supplement_blobs (
  template_id TEXT NOT NULL REFERENCES iw_templates(id),
  supplement_id TEXT NOT NULL,
  part INTEGER NOT NULL CHECK(part >= 0),
  data BLOB NOT NULL CHECK(length(data) > 0 AND length(data) <= 65536),
  PRIMARY KEY(template_id, supplement_id, part)
);
