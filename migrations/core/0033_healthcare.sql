-- COMPLY-002: installation member activity; document custody remains unchanged.
CREATE TABLE iw_member_access (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id) ON DELETE CASCADE,
 last_access_at TEXT NOT NULL
);
