-- Installation state for resumable reads. No credential is persisted.
CREATE TABLE iw_remote_read_windows (provider TEXT PRIMARY KEY, reset_at INTEGER NOT NULL, quota INTEGER NOT NULL, remaining INTEGER NOT NULL);
CREATE TABLE iw_remote_job_sources (job_id TEXT PRIMARY KEY REFERENCES iw_remote_jobs(id) ON DELETE CASCADE, account TEXT NOT NULL);
CREATE TABLE iw_remote_read_cache (job_id TEXT NOT NULL REFERENCES iw_remote_jobs(id) ON DELETE CASCADE, path TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(job_id,path,part));
