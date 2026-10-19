-- ROUTE-009: a member's adopted signature, saved when they sign with their Inkwell session and reused until they change
-- it. Installation state (not archived), like member roles.
CREATE TABLE iw_member_marks (operator_id TEXT PRIMARY KEY, signature TEXT NOT NULL, updated_at TEXT NOT NULL);
