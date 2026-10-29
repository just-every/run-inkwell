CREATE TABLE iw_object_artifacts (
 owner_type TEXT NOT NULL CHECK(owner_type IN ('envelope','template')),
 owner_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 object_key TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes > 0),
 sha256 TEXT NOT NULL,
 PRIMARY KEY(owner_type,owner_id,kind)
);
CREATE INDEX iw_object_artifacts_key ON iw_object_artifacts(object_key);
CREATE TABLE iw_object_pending (
 object_key TEXT PRIMARY KEY,
 owner_type TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1))
);
CREATE TABLE iw_upload_cleanup (upload_id TEXT PRIMARY KEY);
CREATE TRIGGER iw_uploaded_pdf_cleanup AFTER DELETE ON iw_pdf_uploads BEGIN
 INSERT OR IGNORE INTO iw_upload_cleanup(upload_id) VALUES(OLD.id);
END;
CREATE TABLE iw_object_deletions(object_key TEXT PRIMARY KEY);
CREATE TRIGGER iw_object_replaced AFTER UPDATE OF object_key ON iw_object_artifacts
WHEN OLD.object_key <> NEW.object_key BEGIN
 INSERT OR IGNORE INTO iw_object_deletions(object_key) VALUES(OLD.object_key);
END;
CREATE TRIGGER iw_object_released AFTER DELETE ON iw_object_artifacts BEGIN
 INSERT OR IGNORE INTO iw_object_deletions(object_key) VALUES(OLD.object_key);
END;
CREATE TABLE iw_object_erasure_fences(owner_type TEXT NOT NULL,owner_id TEXT NOT NULL,PRIMARY KEY(owner_type,owner_id));
