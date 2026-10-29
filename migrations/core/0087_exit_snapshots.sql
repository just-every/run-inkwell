-- Snapshot working state has a fixed schema. A document export must not alter
-- the installation schema fingerprint used for archive compatibility.
CREATE TABLE iw_exit_snapshot_records (
 job TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
 envelope_id TEXT, ordinal INTEGER NOT NULL, signer INTEGER, data TEXT NOT NULL,
 PRIMARY KEY(job,kind,id)
);
CREATE INDEX iw_exit_snapshot_envelope ON iw_exit_snapshot_records(job,kind,envelope_id,ordinal,id);
CREATE TABLE iw_exit_snapshot_blobs (
 job TEXT NOT NULL, envelope_id TEXT NOT NULL, kind TEXT NOT NULL,
 part INTEGER NOT NULL, data BLOB NOT NULL CHECK(length(data)<102400),
 PRIMARY KEY(job,envelope_id,kind,part)
);
ALTER TABLE iw_exit_exports ADD COLUMN snapshot_version INTEGER NOT NULL DEFAULT 1;
