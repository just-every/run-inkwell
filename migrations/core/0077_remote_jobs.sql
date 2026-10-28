-- Background move-in state is installation custody. No credential or staged byte is restored from an archive.
CREATE TABLE iw_remote_jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner_version INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL, phase TEXT NOT NULL, data TEXT NOT NULL, sealed TEXT, next_at INTEGER NOT NULL DEFAULT 0, claim TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE iw_remote_job_pages (job_id TEXT NOT NULL REFERENCES iw_remote_jobs(id) ON DELETE CASCADE, page INTEGER NOT NULL, preview_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(job_id,page));
CREATE TABLE iw_remote_response_parts (job_id TEXT NOT NULL REFERENCES iw_remote_jobs(id) ON DELETE CASCADE, resource TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(job_id,resource,part));
CREATE TABLE iw_remote_limits (scope TEXT PRIMARY KEY, window_at INTEGER NOT NULL, calls INTEGER NOT NULL, next_at INTEGER NOT NULL DEFAULT 0);
