-- ACCESS-001 / ADMIN-001: Inkwell's role for a Base `member`. A sender prepares, sends and voids the envelopes they
-- created and sees only those; a viewer reads every envelope. A member with no row is a viewer, the read-only
-- authority every member had before these roles existed. Owners and admins set it.
CREATE TABLE IF NOT EXISTS iw_member_roles (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 role TEXT NOT NULL CHECK(role IN ('sender','viewer')),
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
