-- Account-local cap receipts survive later policy changes without containing signer data.
ALTER TABLE iw_sms ADD COLUMN cancellation_reason TEXT;
CREATE TABLE iw_usage_notices (
 month TEXT NOT NULL, policy_version INTEGER NOT NULL, threshold INTEGER NOT NULL,
 at TEXT NOT NULL, committed_micros INTEGER NOT NULL, cap_micros INTEGER NOT NULL,
 PRIMARY KEY(month,policy_version,threshold)
);
CREATE TRIGGER iw_usage_notices_update BEFORE UPDATE ON iw_usage_notices BEGIN SELECT RAISE(ABORT,'Usage notices are append only'); END;
CREATE TRIGGER iw_usage_notices_delete BEFORE DELETE ON iw_usage_notices BEGIN SELECT RAISE(ABORT,'Usage notices are append only'); END;
CREATE TRIGGER iw_usage_notice_reserved AFTER INSERT ON iw_usage_sms BEGIN
 INSERT OR IGNORE INTO iw_usage_notices(month,policy_version,threshold,at,committed_micros,cap_micros)
 SELECT NEW.month,p.version,t.threshold,(SELECT created_at FROM iw_sms WHERE id=NEW.id),
   (SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=NEW.month),p.cap_micros
 FROM iw_usage_policy p CROSS JOIN (SELECT 80 AS threshold UNION ALL SELECT 100) t
 WHERE p.id=1 AND p.cap_micros IS NOT NULL AND
   (SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=NEW.month)*100>=p.cap_micros*t.threshold;
END;
CREATE TRIGGER iw_usage_notice_priced AFTER UPDATE OF charged_micros ON iw_usage_sms BEGIN
 INSERT OR IGNORE INTO iw_usage_notices(month,policy_version,threshold,at,committed_micros,cap_micros)
 SELECT NEW.month,p.version,t.threshold,(SELECT created_at FROM iw_sms WHERE id=NEW.id),
   (SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=NEW.month),p.cap_micros
 FROM iw_usage_policy p CROSS JOIN (SELECT 80 AS threshold UNION ALL SELECT 100) t
 WHERE p.id=1 AND p.cap_micros IS NOT NULL AND
   (SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=NEW.month)*100>=p.cap_micros*t.threshold;
END;
-- A newly lowered cap also records notices from the committed policy history clock.
CREATE TRIGGER iw_usage_notice_policy AFTER UPDATE ON iw_usage_policy BEGIN
 INSERT OR IGNORE INTO iw_usage_notices(month,policy_version,threshold,at,committed_micros,cap_micros)
 SELECT substr(h.at,1,7),NEW.version,t.threshold,h.at,
   COALESCE((SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=substr(h.at,1,7)),0),NEW.cap_micros
 FROM iw_usage_policy_history h CROSS JOIN (SELECT 80 AS threshold UNION ALL SELECT 100) t
 WHERE h.version=NEW.version AND NEW.cap_micros IS NOT NULL AND
   COALESCE((SELECT SUM(MAX(reserved_micros,COALESCE(charged_micros,0))) FROM iw_usage_sms WHERE month=substr(h.at,1,7)),0)*100>=NEW.cap_micros*t.threshold;
END;
