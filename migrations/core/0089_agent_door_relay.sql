-- Start recording relay membership for new decisions. Existing audit history stays local.
CREATE TABLE IF NOT EXISTS agent_door_relay (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, decision_id TEXT NOT NULL, business TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_door_relay_business ON agent_door_relay(business,sequence);
CREATE INDEX IF NOT EXISTS agent_door_relay_decision ON agent_door_relay(decision_id,sequence);
-- Executions inherit only their decision's membership, including no membership.
-- Erasure drops the link, door and consent; preserve its existing membership.
-- Plain INSERT then DELETE: an outer UPSERT's conflict policy overrides a trigger's.
CREATE TRIGGER IF NOT EXISTS agent_door_relay_audit_insert AFTER INSERT ON agent_door_audit
WHEN json_extract(NEW.row,'$.door')='mcp' AND json_extract(NEW.row,'$.consent') IS NOT NULL
BEGIN
  INSERT INTO agent_door_relay(decision_id,business)
    SELECT NEW.id,business FROM (SELECT CASE WHEN json_extract(NEW.row,'$.decision_id') IS NOT NULL THEN
      (SELECT business FROM agent_door_relay WHERE decision_id=json_extract(NEW.row,'$.decision_id') ORDER BY sequence DESC LIMIT 1)
    ELSE COALESCE((SELECT business FROM agent_door_relay WHERE decision_id=NEW.id ORDER BY sequence DESC LIMIT 1),
      (SELECT json_extract(envelope,'$.business') FROM agent_door_state WHERE id=1)) END AS business)
    WHERE business IS NOT NULL;
  DELETE FROM agent_door_relay WHERE decision_id=NEW.id AND (
    sequence<(SELECT MAX(sequence) FROM agent_door_relay WHERE decision_id=NEW.id)
    OR (json_extract(NEW.row,'$.decision_id') IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM agent_door_relay WHERE decision_id=json_extract(NEW.row,'$.decision_id'))));
END;
CREATE TRIGGER IF NOT EXISTS agent_door_relay_audit_update AFTER UPDATE ON agent_door_audit
WHEN EXISTS(SELECT 1 FROM agent_door_relay WHERE decision_id=NEW.id)
  OR (json_extract(NEW.row,'$.door')='mcp' AND json_extract(NEW.row,'$.consent') IS NOT NULL)
BEGIN
  INSERT INTO agent_door_relay(decision_id,business)
    SELECT NEW.id,business FROM (SELECT CASE WHEN json_extract(NEW.row,'$.decision_id') IS NOT NULL THEN
      (SELECT business FROM agent_door_relay WHERE decision_id=json_extract(NEW.row,'$.decision_id') ORDER BY sequence DESC LIMIT 1)
    ELSE COALESCE((SELECT business FROM agent_door_relay WHERE decision_id=NEW.id ORDER BY sequence DESC LIMIT 1),
      (SELECT json_extract(envelope,'$.business') FROM agent_door_state WHERE id=1)) END AS business)
    WHERE business IS NOT NULL;
  DELETE FROM agent_door_relay WHERE decision_id=NEW.id AND (
    sequence<(SELECT MAX(sequence) FROM agent_door_relay WHERE decision_id=NEW.id)
    OR (json_extract(NEW.row,'$.decision_id') IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM agent_door_relay WHERE decision_id=json_extract(NEW.row,'$.decision_id'))));
END;
CREATE TRIGGER IF NOT EXISTS agent_door_relay_approval AFTER UPDATE OF state ON agent_door_approvals
WHEN EXISTS(SELECT 1 FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id'))
BEGIN
  INSERT INTO agent_door_relay(decision_id,business)
    SELECT decision_id,business FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id') ORDER BY sequence DESC LIMIT 1;
  DELETE FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id')
    AND sequence<(SELECT MAX(sequence) FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id'));
END;
CREATE TRIGGER IF NOT EXISTS agent_door_relay_review AFTER UPDATE OF state ON agent_door_reviews
WHEN EXISTS(SELECT 1 FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id'))
BEGIN
  INSERT INTO agent_door_relay(decision_id,business)
    SELECT decision_id,business FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id') ORDER BY sequence DESC LIMIT 1;
  DELETE FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id')
    AND sequence<(SELECT MAX(sequence) FROM agent_door_relay WHERE decision_id=json_extract(NEW.saved,'$.decision_id'));
END;
