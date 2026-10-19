-- ADMIN-001: an envelope shared with a member to view or to edit. Permission state of this installation (not archived),
-- erased with the envelope.
CREATE TABLE iw_shares (envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id), operator_id TEXT NOT NULL, access TEXT NOT NULL CHECK(access IN ('view','edit')), granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, PRIMARY KEY(envelope_id, operator_id));
CREATE INDEX iw_shares_operator ON iw_shares(operator_id);
