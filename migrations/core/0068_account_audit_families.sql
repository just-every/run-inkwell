-- ADMIN-005: adopt immutable business histories and retain every future save.
-- Explicit projections exclude document content, field values, recipient data,
-- disclosure copy, provider destinations and arbitrary nested payload fields.
-- Source histories carry authority independently of the request context.

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'freeform.changed',
  'settings:freeform',
  json_object('enabled',json(CASE WHEN h.before_value=1 THEN 'true' ELSE 'false' END),'version',h.version-1),
  json_object('enabled',json(CASE WHEN h.after_value=1 THEN 'true' ELSE 'false' END),'version',h.version)
 FROM iw_freeform_history h;

CREATE TRIGGER iw_audit_freeform_history AFTER INSERT ON iw_freeform_history
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'freeform.changed',
  'settings:freeform',
  json_object('enabled',json(CASE WHEN NEW.before_value=1 THEN 'true' ELSE 'false' END),'version',NEW.version-1),
  json_object('enabled',json(CASE WHEN NEW.after_value=1 THEN 'true' ELSE 'false' END),'version',NEW.version);
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'send_policy.changed',
  'send-policy:'||h.scope||':'||h.source,
  json_object('mode',CASE WHEN json_extract(h.before_value,'$.mode') IN ('off','person','autonomous') THEN json_extract(h.before_value,'$.mode') END,'templates',json(CASE WHEN json_type(h.before_value,'$.templates')='array' THEN (SELECT json_group_array(value) FROM json_each(h.before_value,'$.templates') WHERE type='text') ELSE 'null' END),'requireInternalApproval',json(CASE WHEN json_type(h.before_value,'$.requireInternalApproval')='true' OR json_extract(h.before_value,'$.requireInternalApproval')=1 THEN 'true' ELSE 'false' END),'deferredRelease',json(CASE WHEN json_type(h.before_value,'$.deferredRelease')='true' OR json_extract(h.before_value,'$.deferredRelease')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END),
  json_object('scope',h.scope,'source',h.source,'mode',h.mode,'templates',json(CASE WHEN h.templates IS NULL THEN 'null' ELSE (SELECT json_group_array(value) FROM json_each(h.templates) WHERE type='text') END),'requireInternalApproval',json(CASE WHEN h.require_internal_approval=1 THEN 'true' ELSE 'false' END),'deferredRelease',json(CASE WHEN h.deferred_release=1 THEN 'true' ELSE 'false' END),'version',h.version,'reason',h.reason)
 FROM iw_send_policy_versions h;

CREATE TRIGGER iw_audit_send_policy_history AFTER INSERT ON iw_send_policy_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'send_policy.changed',
  'send-policy:'||NEW.scope||':'||NEW.source,
  json_object('mode',CASE WHEN json_extract(NEW.before_value,'$.mode') IN ('off','person','autonomous') THEN json_extract(NEW.before_value,'$.mode') END,'templates',json(CASE WHEN json_type(NEW.before_value,'$.templates')='array' THEN (SELECT json_group_array(value) FROM json_each(NEW.before_value,'$.templates') WHERE type='text') ELSE 'null' END),'requireInternalApproval',json(CASE WHEN json_type(NEW.before_value,'$.requireInternalApproval')='true' OR json_extract(NEW.before_value,'$.requireInternalApproval')=1 THEN 'true' ELSE 'false' END),'deferredRelease',json(CASE WHEN json_type(NEW.before_value,'$.deferredRelease')='true' OR json_extract(NEW.before_value,'$.deferredRelease')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END),
  json_object('scope',NEW.scope,'source',NEW.source,'mode',NEW.mode,'templates',json(CASE WHEN NEW.templates IS NULL THEN 'null' ELSE (SELECT json_group_array(value) FROM json_each(NEW.templates) WHERE type='text') END),'requireInternalApproval',json(CASE WHEN NEW.require_internal_approval=1 THEN 'true' ELSE 'false' END),'deferredRelease',json(CASE WHEN NEW.deferred_release=1 THEN 'true' ELSE 'false' END),'version',NEW.version,'reason',NEW.reason);
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'send_policy_scope.changed',
  'send-policy-scope:'||h.id,
  CASE WHEN h.before_value IS NULL OR json_type(h.before_value)='null' THEN NULL ELSE json_object('kind',CASE WHEN json_extract(h.before_value,'$.kind') IN ('group','profile') THEN json_extract(h.before_value,'$.kind') END,'name',CASE WHEN json_type(h.before_value,'$.name')='text' THEN json_extract(h.before_value,'$.name') END,'members',json(CASE WHEN json_type(h.before_value,'$.members')='array' THEN (SELECT json_group_array(value) FROM json_each(h.before_value,'$.members') WHERE type='text') ELSE 'null' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END) END,
  CASE WHEN h.after_value IS NULL OR json_type(h.after_value)='null' THEN NULL ELSE json_object('kind',CASE WHEN json_extract(h.after_value,'$.kind') IN ('group','profile') THEN json_extract(h.after_value,'$.kind') END,'name',CASE WHEN json_type(h.after_value,'$.name')='text' THEN json_extract(h.after_value,'$.name') END,'members',json(CASE WHEN json_type(h.after_value,'$.members')='array' THEN (SELECT json_group_array(value) FROM json_each(h.after_value,'$.members') WHERE type='text') ELSE 'null' END),'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END) END
 FROM iw_send_policy_scope_versions h;

CREATE TRIGGER iw_audit_send_scope_history AFTER INSERT ON iw_send_policy_scope_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'send_policy_scope.changed',
  'send-policy-scope:'||NEW.id,
  CASE WHEN NEW.before_value IS NULL OR json_type(NEW.before_value)='null' THEN NULL ELSE json_object('kind',CASE WHEN json_extract(NEW.before_value,'$.kind') IN ('group','profile') THEN json_extract(NEW.before_value,'$.kind') END,'name',CASE WHEN json_type(NEW.before_value,'$.name')='text' THEN json_extract(NEW.before_value,'$.name') END,'members',json(CASE WHEN json_type(NEW.before_value,'$.members')='array' THEN (SELECT json_group_array(value) FROM json_each(NEW.before_value,'$.members') WHERE type='text') ELSE 'null' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END) END,
  CASE WHEN NEW.after_value IS NULL OR json_type(NEW.after_value)='null' THEN NULL ELSE json_object('kind',CASE WHEN json_extract(NEW.after_value,'$.kind') IN ('group','profile') THEN json_extract(NEW.after_value,'$.kind') END,'name',CASE WHEN json_type(NEW.after_value,'$.name')='text' THEN json_extract(NEW.after_value,'$.name') END,'members',json(CASE WHEN json_type(NEW.after_value,'$.members')='array' THEN (SELECT json_group_array(value) FROM json_each(NEW.after_value,'$.members') WHERE type='text') ELSE 'null' END),'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END) END;
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'envelope_defaults.changed',
  'settings:envelope_defaults',
  json_object('disclosureTextSet',json(CASE WHEN length(COALESCE(json_extract(h.before_value,'$.disclosureText'),''))>0 THEN 'true' ELSE 'false' END),'adoptionMethods',json(CASE WHEN json_type(h.before_value,'$.adoptionMethods')='array' THEN (SELECT json_group_array(value) FROM json_each(h.before_value,'$.adoptionMethods') WHERE type='text' AND value IN ('typed','drawn','uploaded')) ELSE 'null' END),'authentication',CASE WHEN json_extract(h.before_value,'$.authentication') IN ('email','link') THEN json_extract(h.before_value,'$.authentication') END,'allowReassignment',json(CASE WHEN json_type(h.before_value,'$.allowReassignment')='true' OR json_extract(h.before_value,'$.allowReassignment')=1 THEN 'true' ELSE 'false' END),'hideDocumentsWithoutFields',json(CASE WHEN json_type(h.before_value,'$.hideDocumentsWithoutFields')='true' OR json_extract(h.before_value,'$.hideDocumentsWithoutFields')=1 THEN 'true' ELSE 'false' END),'expiryDays',CASE WHEN json_type(h.before_value,'$.expiryDays') IN ('integer','real') THEN json_extract(h.before_value,'$.expiryDays') END,'reminders',json(CASE WHEN json_type(h.before_value,'$.reminders')='object' THEN json_object('afterDays',CASE WHEN json_type(h.before_value,'$.reminders.afterDays') IN ('integer','real') THEN json_extract(h.before_value,'$.reminders.afterDays') END,'everyDays',CASE WHEN json_type(h.before_value,'$.reminders.everyDays') IN ('integer','real') THEN json_extract(h.before_value,'$.reminders.everyDays') END) ELSE 'null' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END),
  json_object('disclosureTextSet',json(CASE WHEN length(COALESCE(json_extract(h.after_value,'$.disclosureText'),''))>0 THEN 'true' ELSE 'false' END),'adoptionMethods',json(CASE WHEN json_type(h.after_value,'$.adoptionMethods')='array' THEN (SELECT json_group_array(value) FROM json_each(h.after_value,'$.adoptionMethods') WHERE type='text' AND value IN ('typed','drawn','uploaded')) ELSE 'null' END),'authentication',CASE WHEN json_extract(h.after_value,'$.authentication') IN ('email','link') THEN json_extract(h.after_value,'$.authentication') END,'allowReassignment',json(CASE WHEN json_type(h.after_value,'$.allowReassignment')='true' OR json_extract(h.after_value,'$.allowReassignment')=1 THEN 'true' ELSE 'false' END),'hideDocumentsWithoutFields',json(CASE WHEN json_type(h.after_value,'$.hideDocumentsWithoutFields')='true' OR json_extract(h.after_value,'$.hideDocumentsWithoutFields')=1 THEN 'true' ELSE 'false' END),'expiryDays',CASE WHEN json_type(h.after_value,'$.expiryDays') IN ('integer','real') THEN json_extract(h.after_value,'$.expiryDays') END,'reminders',json(CASE WHEN json_type(h.after_value,'$.reminders')='object' THEN json_object('afterDays',CASE WHEN json_type(h.after_value,'$.reminders.afterDays') IN ('integer','real') THEN json_extract(h.after_value,'$.reminders.afterDays') END,'everyDays',CASE WHEN json_type(h.after_value,'$.reminders.everyDays') IN ('integer','real') THEN json_extract(h.after_value,'$.reminders.everyDays') END) ELSE 'null' END),'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END)
 FROM iw_envelope_default_versions h;

CREATE TRIGGER iw_audit_envelope_default_history AFTER INSERT ON iw_envelope_default_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'envelope_defaults.changed',
  'settings:envelope_defaults',
  json_object('disclosureTextSet',json(CASE WHEN length(COALESCE(json_extract(NEW.before_value,'$.disclosureText'),''))>0 THEN 'true' ELSE 'false' END),'adoptionMethods',json(CASE WHEN json_type(NEW.before_value,'$.adoptionMethods')='array' THEN (SELECT json_group_array(value) FROM json_each(NEW.before_value,'$.adoptionMethods') WHERE type='text' AND value IN ('typed','drawn','uploaded')) ELSE 'null' END),'authentication',CASE WHEN json_extract(NEW.before_value,'$.authentication') IN ('email','link') THEN json_extract(NEW.before_value,'$.authentication') END,'allowReassignment',json(CASE WHEN json_type(NEW.before_value,'$.allowReassignment')='true' OR json_extract(NEW.before_value,'$.allowReassignment')=1 THEN 'true' ELSE 'false' END),'hideDocumentsWithoutFields',json(CASE WHEN json_type(NEW.before_value,'$.hideDocumentsWithoutFields')='true' OR json_extract(NEW.before_value,'$.hideDocumentsWithoutFields')=1 THEN 'true' ELSE 'false' END),'expiryDays',CASE WHEN json_type(NEW.before_value,'$.expiryDays') IN ('integer','real') THEN json_extract(NEW.before_value,'$.expiryDays') END,'reminders',json(CASE WHEN json_type(NEW.before_value,'$.reminders')='object' THEN json_object('afterDays',CASE WHEN json_type(NEW.before_value,'$.reminders.afterDays') IN ('integer','real') THEN json_extract(NEW.before_value,'$.reminders.afterDays') END,'everyDays',CASE WHEN json_type(NEW.before_value,'$.reminders.everyDays') IN ('integer','real') THEN json_extract(NEW.before_value,'$.reminders.everyDays') END) ELSE 'null' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END),
  json_object('disclosureTextSet',json(CASE WHEN length(COALESCE(json_extract(NEW.after_value,'$.disclosureText'),''))>0 THEN 'true' ELSE 'false' END),'adoptionMethods',json(CASE WHEN json_type(NEW.after_value,'$.adoptionMethods')='array' THEN (SELECT json_group_array(value) FROM json_each(NEW.after_value,'$.adoptionMethods') WHERE type='text' AND value IN ('typed','drawn','uploaded')) ELSE 'null' END),'authentication',CASE WHEN json_extract(NEW.after_value,'$.authentication') IN ('email','link') THEN json_extract(NEW.after_value,'$.authentication') END,'allowReassignment',json(CASE WHEN json_type(NEW.after_value,'$.allowReassignment')='true' OR json_extract(NEW.after_value,'$.allowReassignment')=1 THEN 'true' ELSE 'false' END),'hideDocumentsWithoutFields',json(CASE WHEN json_type(NEW.after_value,'$.hideDocumentsWithoutFields')='true' OR json_extract(NEW.after_value,'$.hideDocumentsWithoutFields')=1 THEN 'true' ELSE 'false' END),'expiryDays',CASE WHEN json_type(NEW.after_value,'$.expiryDays') IN ('integer','real') THEN json_extract(NEW.after_value,'$.expiryDays') END,'reminders',json(CASE WHEN json_type(NEW.after_value,'$.reminders')='object' THEN json_object('afterDays',CASE WHEN json_type(NEW.after_value,'$.reminders.afterDays') IN ('integer','real') THEN json_extract(NEW.after_value,'$.reminders.afterDays') END,'everyDays',CASE WHEN json_type(NEW.after_value,'$.reminders.everyDays') IN ('integer','real') THEN json_extract(NEW.after_value,'$.reminders.everyDays') END) ELSE 'null' END),'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END);
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'usage_policy.changed',
  'settings:usage',
  json_object('capMicros',CASE WHEN json_type(h.before_value,'$.capMicros') IN ('integer','real') THEN json_extract(h.before_value,'$.capMicros') END,'reserveMicros',CASE WHEN json_type(h.before_value,'$.reserveMicros') IN ('integer','real') THEN json_extract(h.before_value,'$.reserveMicros') END,'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END),
  json_object('capMicros',CASE WHEN json_type(h.after_value,'$.capMicros') IN ('integer','real') THEN json_extract(h.after_value,'$.capMicros') END,'reserveMicros',CASE WHEN json_type(h.after_value,'$.reserveMicros') IN ('integer','real') THEN json_extract(h.after_value,'$.reserveMicros') END,'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END)
 FROM iw_usage_policy_history h;

CREATE TRIGGER iw_audit_usage_policy_history AFTER INSERT ON iw_usage_policy_history
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'usage_policy.changed',
  'settings:usage',
  json_object('capMicros',CASE WHEN json_type(NEW.before_value,'$.capMicros') IN ('integer','real') THEN json_extract(NEW.before_value,'$.capMicros') END,'reserveMicros',CASE WHEN json_type(NEW.before_value,'$.reserveMicros') IN ('integer','real') THEN json_extract(NEW.before_value,'$.reserveMicros') END,'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END),
  json_object('capMicros',CASE WHEN json_type(NEW.after_value,'$.capMicros') IN ('integer','real') THEN json_extract(NEW.after_value,'$.capMicros') END,'reserveMicros',CASE WHEN json_type(NEW.after_value,'$.reserveMicros') IN ('integer','real') THEN json_extract(NEW.after_value,'$.reserveMicros') END,'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END);
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'api_key_permission.changed',
  'member:'||h.member_id,
  CASE WHEN h.before_value IS NULL OR json_type(h.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.before_value,'$.enabled')='true' OR json_extract(h.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END) END,
  CASE WHEN h.after_value IS NULL OR json_type(h.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.after_value,'$.enabled')='true' OR json_extract(h.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END) END
 FROM iw_api_key_permission_versions h;

CREATE TRIGGER iw_audit_api_key_permission_history AFTER INSERT ON iw_api_key_permission_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'api_key_permission.changed',
  'member:'||NEW.member_id,
  CASE WHEN NEW.before_value IS NULL OR json_type(NEW.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.before_value,'$.enabled')='true' OR json_extract(NEW.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END) END,
  CASE WHEN NEW.after_value IS NULL OR json_type(NEW.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.after_value,'$.enabled')='true' OR json_extract(NEW.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END) END;
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'form_permission.changed',
  'member:'||h.member_id,
  CASE WHEN h.before_value IS NULL OR json_type(h.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.before_value,'$.enabled')='true' OR json_extract(h.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END) END,
  CASE WHEN h.after_value IS NULL OR json_type(h.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.after_value,'$.enabled')='true' OR json_extract(h.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END) END
 FROM iw_form_permission_versions h;

CREATE TRIGGER iw_audit_form_permission_history AFTER INSERT ON iw_form_permission_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'form_permission.changed',
  'member:'||NEW.member_id,
  CASE WHEN NEW.before_value IS NULL OR json_type(NEW.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.before_value,'$.enabled')='true' OR json_extract(NEW.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END) END,
  CASE WHEN NEW.after_value IS NULL OR json_type(NEW.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.after_value,'$.enabled')='true' OR json_extract(NEW.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END) END;
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'form.published',
  'form:'||h.id,
  NULL,
  json_object('ownerId',CASE WHEN json_type(h.data,'$.ownerId')='text' THEN json_extract(h.data,'$.ownerId') END,'templateId',CASE WHEN json_type(h.data,'$.templateId')='text' THEN json_extract(h.data,'$.templateId') END,'templateVersion',CASE WHEN json_type(h.data,'$.templateVersion') IN ('integer','real') THEN json_extract(h.data,'$.templateVersion') END,'publicRole',CASE WHEN json_type(h.data,'$.publicRole') IN ('integer','real') THEN json_extract(h.data,'$.publicRole') END,'totalLimit',CASE WHEN json_type(h.data,'$.totalLimit') IN ('integer','real') THEN json_extract(h.data,'$.totalLimit') END,'dailyLimit',CASE WHEN json_type(h.data,'$.dailyLimit') IN ('integer','real') THEN json_extract(h.data,'$.dailyLimit') END,'expiresAt',CASE WHEN json_type(h.data,'$.expiresAt')='text' THEN json_extract(h.data,'$.expiresAt') END)
 FROM iw_form_versions h;

CREATE TRIGGER iw_audit_form_history AFTER INSERT ON iw_form_versions
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'form.published',
  'form:'||NEW.id,
  NULL,
  json_object('ownerId',CASE WHEN json_type(NEW.data,'$.ownerId')='text' THEN json_extract(NEW.data,'$.ownerId') END,'templateId',CASE WHEN json_type(NEW.data,'$.templateId')='text' THEN json_extract(NEW.data,'$.templateId') END,'templateVersion',CASE WHEN json_type(NEW.data,'$.templateVersion') IN ('integer','real') THEN json_extract(NEW.data,'$.templateVersion') END,'publicRole',CASE WHEN json_type(NEW.data,'$.publicRole') IN ('integer','real') THEN json_extract(NEW.data,'$.publicRole') END,'totalLimit',CASE WHEN json_type(NEW.data,'$.totalLimit') IN ('integer','real') THEN json_extract(NEW.data,'$.totalLimit') END,'dailyLimit',CASE WHEN json_type(NEW.data,'$.dailyLimit') IN ('integer','real') THEN json_extract(NEW.data,'$.dailyLimit') END,'expiresAt',CASE WHEN json_type(NEW.data,'$.expiresAt')='text' THEN json_extract(NEW.data,'$.expiresAt') END);
END;

-- Adopt existing records using their original actor and timestamp.
INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  h.at,
  h.actor,
  'filing.changed',
  'filing:'||h.template_id||':'||h.provider,
  CASE WHEN h.before_value IS NULL OR json_type(h.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.before_value,'$.enabled')='true' OR json_extract(h.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.before_value,'$.version') IN ('integer','real') THEN json_extract(h.before_value,'$.version') END,'destinationConfigured',json(CASE WHEN json_extract(h.before_value,'$.folder') IS NOT NULL THEN 'true' ELSE 'false' END)) END,
  json_object('settings',json(CASE WHEN h.after_value IS NULL OR json_type(h.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(h.after_value,'$.enabled')='true' OR json_extract(h.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(h.after_value,'$.version') IN ('integer','real') THEN json_extract(h.after_value,'$.version') END,'destinationConfigured',json(CASE WHEN json_extract(h.after_value,'$.folder') IS NOT NULL THEN 'true' ELSE 'false' END)) END),'provider',CASE WHEN h.provider IN ('box','dropbox') THEN h.provider END,'consent',CASE WHEN h.consent='I authorize automatic transfer of completed PDFs and certificates from this template to the selected provider folder.' THEN 'authorized' WHEN h.consent='Automatic filing disabled' THEN 'disabled' ELSE '[redacted]' END)
 FROM iw_filing_history h;

CREATE TRIGGER iw_audit_filing_history AFTER INSERT ON iw_filing_history
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 SELECT lower(hex(randomblob(16))),
  NEW.at,
  NEW.actor,
  'filing.changed',
  'filing:'||NEW.template_id||':'||NEW.provider,
  CASE WHEN NEW.before_value IS NULL OR json_type(NEW.before_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.before_value,'$.enabled')='true' OR json_extract(NEW.before_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.before_value,'$.version') IN ('integer','real') THEN json_extract(NEW.before_value,'$.version') END,'destinationConfigured',json(CASE WHEN json_extract(NEW.before_value,'$.folder') IS NOT NULL THEN 'true' ELSE 'false' END)) END,
  json_object('settings',json(CASE WHEN NEW.after_value IS NULL OR json_type(NEW.after_value)='null' THEN NULL ELSE json_object('enabled',json(CASE WHEN json_type(NEW.after_value,'$.enabled')='true' OR json_extract(NEW.after_value,'$.enabled')=1 THEN 'true' ELSE 'false' END),'version',CASE WHEN json_type(NEW.after_value,'$.version') IN ('integer','real') THEN json_extract(NEW.after_value,'$.version') END,'destinationConfigured',json(CASE WHEN json_extract(NEW.after_value,'$.folder') IS NOT NULL THEN 'true' ELSE 'false' END)) END),'provider',CASE WHEN NEW.provider IN ('box','dropbox') THEN NEW.provider END,'consent',CASE WHEN NEW.consent='I authorize automatic transfer of completed PDFs and certificates from this template to the selected provider folder.' THEN 'authorized' WHEN NEW.consent='Automatic filing disabled' THEN 'disabled' ELSE '[redacted]' END);
END;
