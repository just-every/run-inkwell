CREATE TABLE iw_pdf_uploads (id TEXT PRIMARY KEY, actor TEXT NOT NULL, size INTEGER NOT NULL, filename TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE iw_pdf_upload_parts (upload_id TEXT NOT NULL REFERENCES iw_pdf_uploads(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(upload_id,part));
CREATE TABLE iw_blob_staging (id TEXT NOT NULL, part INTEGER NOT NULL, created_at TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(id,part));
