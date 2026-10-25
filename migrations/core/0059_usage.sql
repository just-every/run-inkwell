-- Installation-local totals contain no recipient or document content.
CREATE TABLE iw_usage_policy (
 id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL,
 cap_micros INTEGER CHECK(cap_micros>=0), reserve_micros INTEGER NOT NULL CHECK(reserve_micros>=0)
);
INSERT INTO iw_usage_policy VALUES(1,0,NULL,0);
CREATE TABLE iw_usage_policy_history (
 version INTEGER PRIMARY KEY, actor TEXT NOT NULL, at TEXT NOT NULL,
 before_value TEXT NOT NULL, after_value TEXT NOT NULL
);
CREATE TRIGGER iw_usage_history_update BEFORE UPDATE ON iw_usage_policy_history BEGIN SELECT RAISE(ABORT,'Usage history is append only'); END;
CREATE TRIGGER iw_usage_history_delete BEFORE DELETE ON iw_usage_policy_history BEGIN SELECT RAISE(ABORT,'Usage history is append only'); END;
CREATE TABLE iw_usage_sms (
 id TEXT PRIMARY KEY, month TEXT NOT NULL, reserved_micros INTEGER NOT NULL,
 charged_micros INTEGER, outcome TEXT NOT NULL DEFAULT 'unconfirmed'
);
CREATE INDEX iw_usage_sms_month ON iw_usage_sms(month);
ALTER TABLE iw_sms ADD COLUMN usage_month TEXT;
CREATE TRIGGER iw_sms_usage_claim BEFORE UPDATE OF state ON iw_sms
WHEN NEW.state='sending' AND OLD.state='pending' BEGIN
 SELECT CASE WHEN (SELECT cap_micros FROM iw_usage_policy WHERE id=1) IS NOT NULL AND (
  (SELECT reserve_micros FROM iw_usage_policy WHERE id=1)<=0 OR
  COALESCE((SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=NEW.usage_month),0)
   +(SELECT reserve_micros FROM iw_usage_policy WHERE id=1)>(SELECT cap_micros FROM iw_usage_policy WHERE id=1)
 ) THEN RAISE(ABORT,'SMS monthly cap reached') END;
 INSERT INTO iw_usage_sms(id,month,reserved_micros) SELECT NEW.id,NEW.usage_month,reserve_micros FROM iw_usage_policy WHERE id=1;
END;

CREATE TABLE iw_usage_envelopes (month TEXT PRIMARY KEY, total INTEGER NOT NULL);
INSERT INTO iw_usage_envelopes SELECT substr(json_extract(data,'$.at'),1,7), COUNT(DISTINCT envelope_id) FROM iw_events
 WHERE json_extract(data,'$.action')='envelope.sent_scheduled' OR
 (json_extract(data,'$.action')='envelope.approved' AND COALESCE(json_extract(data,'$.detail.approvedForLater'),0)!=1)
 GROUP BY substr(json_extract(data,'$.at'),1,7);
