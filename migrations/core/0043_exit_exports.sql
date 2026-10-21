CREATE TABLE iw_exit_exports(id TEXT PRIMARY KEY, actor TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, owner_scope INTEGER NOT NULL CHECK(owner_scope IN(0,1)));
CREATE TABLE iw_exit_members(job TEXT NOT NULL REFERENCES iw_exit_exports(id), record_id TEXT NOT NULL, PRIMARY KEY(job,record_id));
