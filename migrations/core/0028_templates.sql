-- TMPL-001: reusable templates: one fixed PDF with roles, fields and envelope settings, kept apart from envelopes.
CREATE TABLE iw_templates (id TEXT PRIMARY KEY, created_by TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE iw_template_blobs (template_id TEXT NOT NULL REFERENCES iw_templates(id), part INTEGER NOT NULL, data BLOB NOT NULL CHECK(length(data)<102400), PRIMARY KEY(template_id,part));
