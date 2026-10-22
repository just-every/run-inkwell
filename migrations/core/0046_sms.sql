ALTER TABLE iw_signers ADD COLUMN code_channel TEXT NOT NULL DEFAULT 'email';
-- Private, installation-local transport custody; never export credentials, codes or links.
CREATE TABLE iw_sms (
 id TEXT PRIMARY KEY,
 envelope_id TEXT NOT NULL,
 signer INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('code','invitation','followup')),
 recipient TEXT NOT NULL,
 recipient_email TEXT NOT NULL,
 token_hash TEXT,
 code_generation INTEGER,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','uncertain','cancelled')),
 provider TEXT,
 provider_message_id TEXT,
 sent_at TEXT,
 followup_version INTEGER,
 followup_envelope_version INTEGER
);
CREATE INDEX iw_sms_pending ON iw_sms(state,envelope_id);
CREATE TRIGGER iw_sms_closed AFTER UPDATE OF data ON iw_envelopes
WHEN json_extract(NEW.data,'$.status')!='awaiting_signature' BEGIN
 UPDATE iw_sms SET state='cancelled',body='' WHERE envelope_id=NEW.id AND state='pending';
END;
CREATE TRIGGER iw_sms_grant_revoked AFTER UPDATE OF state ON iw_followup_grants
WHEN NEW.state!='active' BEGIN
 UPDATE iw_sms SET state='cancelled',body='' WHERE envelope_id=NEW.envelope_id AND followup_version=NEW.version AND state='pending';
END;
