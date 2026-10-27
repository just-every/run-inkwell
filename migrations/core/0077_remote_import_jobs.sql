-- Installation-only review checkpoints. Provider credentials are never stored.
CREATE TABLE iw_remote_jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE iw_remote_job_pages (job_id TEXT NOT NULL REFERENCES iw_remote_jobs(id), page INTEGER NOT NULL, preview_id TEXT NOT NULL REFERENCES iw_remote_previews(id), PRIMARY KEY(job_id,page));
CREATE TABLE iw_remote_limits (provider TEXT PRIMARY KEY, until_at INTEGER NOT NULL);
