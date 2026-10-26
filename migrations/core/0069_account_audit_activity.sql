-- ADMIN-005: adopt existing follow-up and embedding events.
-- Existing event records retain their source actor and timestamp.
-- Reply bodies, reply headers, origins, launch hashes, invitation material and
-- recipient hashes never enter these projections. Only fixed causes survive.
-- New credential and form transitions require the atomic request context.
-- Credential issuance predating this migration has no complete change history;
-- no past revoker, rotator or scope editor is inferred from the creator.

INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  json_extract(h.data,'$.at'),
  json_extract(h.data,'$.actor'),
  json_extract(h.data,'$.action'),
  'envelope:'||h.envelope_id,
  NULL,
  json_object('sequence',h.sequence,'signer',CASE WHEN json_type(h.data,'$.detail.signer')='integer' THEN json_extract(h.data,'$.detail.signer') END,'version',CASE WHEN json_type(h.data,'$.detail.version')='integer' THEN json_extract(h.data,'$.detail.version') END,'memberId',CASE WHEN json_type(h.data,'$.detail.member')='text' THEN json_extract(h.data,'$.detail.member') END,'replyId',CASE WHEN json_type(h.data,'$.detail.reply')='text' THEN json_extract(h.data,'$.detail.reply') END,'cause',CASE WHEN json_extract(h.data,'$.detail.cause') IN ('bad address','contact limit','unavailable','substantive reply','unverified sender','not opened','opened and left','repeated views','corrected address proposed','address needs correcting','contact limit reached','return date is after expiry','SMS number changed or unavailable; renew the follow-up grant','invitation link unavailable') THEN json_extract(h.data,'$.detail.cause') END,'channel',CASE WHEN json_extract(h.data,'$.detail.channel') IN ('email','sms') THEN json_extract(h.data,'$.detail.channel') END)
 FROM iw_events h
 WHERE json_extract(h.data,'$.action') IN ('followup.granted','followup.revoked','followup.resumed','followup.viewed','followup.attention','followup.sent','followup.reply_received','followup.suspended','followup.ended');

CREATE TRIGGER iw_audit_followup_event AFTER INSERT ON iw_events
WHEN json_extract(NEW.data,'$.action') IN ('followup.granted','followup.revoked','followup.resumed','followup.viewed','followup.attention','followup.sent','followup.reply_received','followup.suspended','followup.ended')
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  json_extract(NEW.data,'$.at'),
  json_extract(NEW.data,'$.actor'),
  json_extract(NEW.data,'$.action'),
  'envelope:'||NEW.envelope_id,
  NULL,
  json_object('sequence',NEW.sequence,'signer',CASE WHEN json_type(NEW.data,'$.detail.signer')='integer' THEN json_extract(NEW.data,'$.detail.signer') END,'version',CASE WHEN json_type(NEW.data,'$.detail.version')='integer' THEN json_extract(NEW.data,'$.detail.version') END,'memberId',CASE WHEN json_type(NEW.data,'$.detail.member')='text' THEN json_extract(NEW.data,'$.detail.member') END,'replyId',CASE WHEN json_type(NEW.data,'$.detail.reply')='text' THEN json_extract(NEW.data,'$.detail.reply') END,'cause',CASE WHEN json_extract(NEW.data,'$.detail.cause') IN ('bad address','contact limit','unavailable','substantive reply','unverified sender','not opened','opened and left','repeated views','corrected address proposed','address needs correcting','contact limit reached','return date is after expiry','SMS number changed or unavailable; renew the follow-up grant','invitation link unavailable') THEN json_extract(NEW.data,'$.detail.cause') END,'channel',CASE WHEN json_extract(NEW.data,'$.detail.channel') IN ('email','sms') THEN json_extract(NEW.data,'$.detail.channel') END);
END;

INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'embedding.'||h.action,
  'embedding:'||h.id,
  NULL,
  json_object('envelopeId',h.envelope_id,'purpose',CASE WHEN json_extract(h.detail,'$.purpose') IN ('grant','sign','prepare','redeem','request','issue','launch','session') THEN json_extract(h.detail,'$.purpose') END,'outcome',CASE WHEN json_extract(h.detail,'$.outcome') IN ('allowed','refused','closed') THEN json_extract(h.detail,'$.outcome') END,'consent',json(CASE json_type(h.detail,'$.consent') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE 'null' END),'consentVersion',CASE WHEN json_extract(h.detail,'$.consentVersion') IN ('embedding-2026-10-26') THEN json_extract(h.detail,'$.consentVersion') END,'version',CASE WHEN json_type(h.detail,'$.version')='integer' THEN json_extract(h.detail,'$.version') END,'grantVersion',CASE WHEN json_type(h.detail,'$.grantVersion')='integer' THEN json_extract(h.detail,'$.grantVersion') END,'expiresAt',CASE WHEN json_type(h.detail,'$.expiresAt')='integer' THEN json_extract(h.detail,'$.expiresAt') END,'status',CASE WHEN json_type(h.detail,'$.status')='integer' THEN json_extract(h.detail,'$.status') END,'beforeEnabled',json(CASE WHEN json_type(h.detail,'$.before')='text' THEN 'true' ELSE 'false' END),'afterEnabled',json(CASE WHEN json_type(h.detail,'$.after')='text' THEN 'true' ELSE 'false' END))
 FROM iw_embed_audit h
 WHERE h.action IN ('origin.changed','launch.authorized','launch.redeemed','launch.closed','launch.expired','authority.refused','request.refused','limit.refused');

CREATE TRIGGER iw_audit_embedding_history AFTER INSERT ON iw_embed_audit
WHEN NEW.action IN ('origin.changed','launch.authorized','launch.redeemed','launch.closed','launch.expired','authority.refused','request.refused','limit.refused')
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'embedding.'||NEW.action,
  'embedding:'||NEW.id,
  NULL,
  json_object('envelopeId',NEW.envelope_id,'purpose',CASE WHEN json_extract(NEW.detail,'$.purpose') IN ('grant','sign','prepare','redeem','request','issue','launch','session') THEN json_extract(NEW.detail,'$.purpose') END,'outcome',CASE WHEN json_extract(NEW.detail,'$.outcome') IN ('allowed','refused','closed') THEN json_extract(NEW.detail,'$.outcome') END,'consent',json(CASE json_type(NEW.detail,'$.consent') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE 'null' END),'consentVersion',CASE WHEN json_extract(NEW.detail,'$.consentVersion') IN ('embedding-2026-10-26') THEN json_extract(NEW.detail,'$.consentVersion') END,'version',CASE WHEN json_type(NEW.detail,'$.version')='integer' THEN json_extract(NEW.detail,'$.version') END,'grantVersion',CASE WHEN json_type(NEW.detail,'$.grantVersion')='integer' THEN json_extract(NEW.detail,'$.grantVersion') END,'expiresAt',CASE WHEN json_type(NEW.detail,'$.expiresAt')='integer' THEN json_extract(NEW.detail,'$.expiresAt') END,'status',CASE WHEN json_type(NEW.detail,'$.status')='integer' THEN json_extract(NEW.detail,'$.status') END,'beforeEnabled',json(CASE WHEN json_type(NEW.detail,'$.before')='text' THEN 'true' ELSE 'false' END),'afterEnabled',json(CASE WHEN json_type(NEW.detail,'$.after')='text' THEN 'true' ELSE 'false' END));
END;

CREATE TRIGGER iw_audit_api_key_issue AFTER INSERT ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  NEW.created_at,
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.issued',
  'api-key:'||NEW.id,
  NULL,
  json_object('memberId',NEW.member_id,'memberVersion',NEW.member_version,'memberRole',NEW.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(NEW.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',NEW.expires_at,'revokedAt',NEW.revoked_at,'suspendedAt',NEW.suspended_at,'rotatedTo',NEW.rotated_to,'version',NEW.version));
END;

CREATE TRIGGER iw_audit_api_key_revoke AFTER UPDATE ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  NEW.revoked_at,
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.revoked',
  'api-key:'||NEW.id,
  json_object('memberId',OLD.member_id,'memberVersion',OLD.member_version,'memberRole',OLD.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(OLD.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',OLD.expires_at,'revokedAt',OLD.revoked_at,'suspendedAt',OLD.suspended_at,'rotatedTo',OLD.rotated_to,'version',OLD.version),
  json_object('memberId',NEW.member_id,'memberVersion',NEW.member_version,'memberRole',NEW.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(NEW.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',NEW.expires_at,'revokedAt',NEW.revoked_at,'suspendedAt',NEW.suspended_at,'rotatedTo',NEW.rotated_to,'version',NEW.version));
END;

CREATE TRIGGER iw_audit_api_key_suspend AFTER UPDATE ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.suspended_at IS NULL AND NEW.suspended_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  NEW.suspended_at,
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.suspended',
  'api-key:'||NEW.id,
  json_object('memberId',OLD.member_id,'memberVersion',OLD.member_version,'memberRole',OLD.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(OLD.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',OLD.expires_at,'revokedAt',OLD.revoked_at,'suspendedAt',OLD.suspended_at,'rotatedTo',OLD.rotated_to,'version',OLD.version),
  json_object('memberId',NEW.member_id,'memberVersion',NEW.member_version,'memberRole',NEW.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(NEW.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',NEW.expires_at,'revokedAt',NEW.revoked_at,'suspendedAt',NEW.suspended_at,'rotatedTo',NEW.rotated_to,'version',NEW.version));
END;

CREATE TRIGGER iw_audit_api_key_rotate AFTER UPDATE ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.rotated_to IS NOT NEW.rotated_to)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.rotated',
  'api-key:'||NEW.id,
  json_object('memberId',OLD.member_id,'memberVersion',OLD.member_version,'memberRole',OLD.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(OLD.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',OLD.expires_at,'revokedAt',OLD.revoked_at,'suspendedAt',OLD.suspended_at,'rotatedTo',OLD.rotated_to,'version',OLD.version),
  json_object('memberId',NEW.member_id,'memberVersion',NEW.member_version,'memberRole',NEW.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(NEW.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',NEW.expires_at,'revokedAt',NEW.revoked_at,'suspendedAt',NEW.suspended_at,'rotatedTo',NEW.rotated_to,'version',NEW.version));
END;

CREATE TRIGGER iw_audit_api_key_scopes AFTER UPDATE ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.scopes IS NOT NEW.scopes)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.scopes_changed',
  'api-key:'||NEW.id,
  json_object('memberId',OLD.member_id,'memberVersion',OLD.member_version,'memberRole',OLD.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(OLD.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',OLD.expires_at,'revokedAt',OLD.revoked_at,'suspendedAt',OLD.suspended_at,'rotatedTo',OLD.rotated_to,'version',OLD.version),
  json_object('memberId',NEW.member_id,'memberVersion',NEW.member_version,'memberRole',NEW.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(NEW.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',NEW.expires_at,'revokedAt',NEW.revoked_at,'suspendedAt',NEW.suspended_at,'rotatedTo',NEW.rotated_to,'version',NEW.version));
END;

CREATE TRIGGER iw_audit_api_key_delete AFTER DELETE ON iw_api_keys
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'api_key.deleted',
  'api-key:'||OLD.id,
  json_object('memberId',OLD.member_id,'memberVersion',OLD.member_version,'memberRole',OLD.member_role,'scopes',json((SELECT json_group_array(value) FROM json_each(OLD.scopes) WHERE type='text' AND value IN ('envelopes:read','artifacts:read','templates:read','envelopes:prepare','envelopes:send','envelopes:manage'))),'expiresAt',OLD.expires_at,'revokedAt',OLD.revoked_at,'suspendedAt',OLD.suspended_at,'rotatedTo',OLD.rotated_to,'version',OLD.version),
  NULL);
END;

CREATE TRIGGER iw_audit_form_disable AFTER UPDATE ON iw_forms
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  NEW.disabled_at,
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'form.disabled',
  'form:'||NEW.id,
  json_object('ownerId',OLD.owner_id,'templateId',OLD.template_id,'templateVersion',OLD.template_version,'disabledAt',OLD.disabled_at,'suspendedAt',OLD.suspended_at),
  json_object('ownerId',NEW.owner_id,'templateId',NEW.template_id,'templateVersion',NEW.template_version,'disabledAt',NEW.disabled_at,'suspendedAt',NEW.suspended_at));
END;

CREATE TRIGGER iw_audit_form_suspend AFTER UPDATE ON iw_forms
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.suspended_at IS NULL AND NEW.suspended_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),
  NEW.suspended_at,
  (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),
  'form.suspended',
  'form:'||NEW.id,
  json_object('ownerId',OLD.owner_id,'templateId',OLD.template_id,'templateVersion',OLD.template_version,'disabledAt',OLD.disabled_at,'suspendedAt',OLD.suspended_at),
  json_object('ownerId',NEW.owner_id,'templateId',NEW.template_id,'templateVersion',NEW.template_version,'disabledAt',NEW.disabled_at,'suspendedAt',NEW.suspended_at));
END;
