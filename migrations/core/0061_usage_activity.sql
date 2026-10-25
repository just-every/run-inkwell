-- Threshold notices reach current account administrators in their private Activity feed.
CREATE TRIGGER iw_usage_activity AFTER INSERT ON iw_usage_notices BEGIN
 INSERT OR IGNORE INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient)
 SELECT 'usage:'||NEW.month||':'||NEW.policy_version||':'||NEW.threshold||':'||o.id,o.id,
  'usage:'||NEW.month||':'||NEW.policy_version||':'||NEW.threshold,'usage_cap',NEW.at,
  'SMS '||NEW.threshold||'% cap notice',
  NEW.month||': '||printf('$%.2f',NEW.committed_micros/1000000.0)||' USD committed against '||printf('$%.2f',NEW.cap_micros/1000000.0)||' USD. Review the cap in Settings. Authentication remains unchanged.'
 FROM oa_operators o WHERE o.status='active' AND o.role IN ('owner','admin');
END;
-- Existing durable thresholds also receive exactly one feed entry per administrator.
INSERT OR IGNORE INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient)
 SELECT 'usage:'||n.month||':'||n.policy_version||':'||n.threshold||':'||o.id,o.id,
  'usage:'||n.month||':'||n.policy_version||':'||n.threshold,'usage_cap',n.at,
  'SMS '||n.threshold||'% cap notice',
  n.month||': '||printf('$%.2f',n.committed_micros/1000000.0)||' USD committed against '||printf('$%.2f',n.cap_micros/1000000.0)||' USD. Review the cap in Settings. Authentication remains unchanged.'
 FROM iw_usage_notices n CROSS JOIN oa_operators o WHERE o.status='active' AND o.role IN ('owner','admin');
