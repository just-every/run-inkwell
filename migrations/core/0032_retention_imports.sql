-- Keep retention clocks outside canonical import values so undo remains exact.
CREATE TABLE iw_import_retention (
 job_id TEXT PRIMARY KEY,
 records TEXT NOT NULL CHECK(json_valid(records)),
 imported_at TEXT,
 due TEXT, warned_at TEXT, purge_at TEXT,
 purged_at TEXT
);
CREATE TABLE iw_import_holds (record_id TEXT PRIMARY KEY, reason TEXT NOT NULL, actor TEXT NOT NULL, placed_at TEXT NOT NULL);
CREATE TABLE iw_import_hold_events (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE iw_import_retention_mail (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', provider TEXT, provider_message_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), sent_at TEXT);
CREATE INDEX iw_import_retention_mail_provider_message ON iw_import_retention_mail(provider,provider_message_id);
-- Existing jobs have valid DocuSeal terminal times even when the owner undid them.
-- This edition uses Base's default JSON plan storage, including ordered chunks.
INSERT INTO iw_import_retention(job_id,records)
SELECT j.id, json_group_array(json_object('id',json_extract(f.value,'$.targetId'),'at',json_extract(f.value,'$.value.completedAt')))
FROM ik_jobs j,
 json_each(CASE WHEN json_extract(j.plan_json,'$.d1Plan')=1 THEN (SELECT group_concat(body,'') FROM (SELECT body FROM ik_d1_plan_chunks WHERE job_id=j.id ORDER BY ordinal)) ELSE j.plan_json END,'$.entries') e,
 json_each(e.value,'$.effects') f
WHERE j.destination='inkwell' AND j.namespace='docuseal-completed-archive' AND json_extract(f.value,'$.targetKind')='archive'
GROUP BY j.id;
INSERT OR IGNORE INTO iw_import_retention(job_id,records) SELECT id,'[]' FROM ik_jobs WHERE destination='inkwell' AND namespace='docuseal-completed-archive';
-- Native imported envelopes share the ordinary owner-erasure door.
CREATE TRIGGER iw_import_retention_envelope_erased AFTER DELETE ON iw_envelopes BEGIN
 DELETE FROM iw_import_retention_mail WHERE group_id='envelope:'||OLD.id;
END;
