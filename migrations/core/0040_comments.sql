-- Private transcripts travel with document custody, separately from public envelope/audit projections.
CREATE TABLE iw_comment_threads (
 id TEXT PRIMARY KEY,
 envelope_id TEXT NOT NULL REFERENCES iw_envelopes(id),
 data TEXT NOT NULL
);
CREATE INDEX iw_comment_threads_envelope ON iw_comment_threads(envelope_id);
