-- ADMIN-005: installation business history, separate from legacy oa_auth_audit.
-- Context is transient and MUST be excluded from archives. The account audit
-- table itself travels in the whole-installation archive. No identity foreign
-- keys: member erasure must never remove action, time and opaque actor history.
CREATE TABLE iw_account_audit (
 id TEXT PRIMARY KEY CHECK(length(id)=32),
 at TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 target TEXT NOT NULL,
 before_json TEXT CHECK(before_json IS NULL OR (json_valid(before_json) AND json_type(before_json)='object')),
 after_json TEXT CHECK(after_json IS NULL OR (json_valid(after_json) AND json_type(after_json)='object'))
);
CREATE INDEX iw_account_audit_order ON iw_account_audit(at DESC,id DESC);
CREATE INDEX iw_account_audit_actor ON iw_account_audit(actor_id,at DESC,id DESC);
CREATE INDEX iw_account_audit_action ON iw_account_audit(action,at DESC,id DESC);
CREATE INDEX iw_account_audit_target ON iw_account_audit(target,at DESC,id DESC);
CREATE TABLE iw_account_audit_context (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 actor_id TEXT NOT NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('operator','system'))
);

-- Only a request scoped transaction creates entries; bootstrap and raw archive
-- restore do not invent history. Whitelists deliberately omit all credentials,
-- URLs, document bytes, signer values, network evidence and private messages.

CREATE TRIGGER iw_audit_member_insert AFTER INSERT ON oa_operators
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),CASE WHEN NEW.status='invited' THEN 'member.invited' ELSE 'member.created' END,'member:'||NEW.id,NULL,json_object('email',NEW.email,'displayName',NEW.display_name,'role',NEW.role,'status',NEW.status));
END;

CREATE TRIGGER iw_audit_member_update AFTER UPDATE ON oa_operators
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.email IS NOT NEW.email OR OLD.display_name IS NOT NEW.display_name OR OLD.role IS NOT NEW.role OR OLD.status IS NOT NEW.status)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),CASE WHEN OLD.status='invited' AND NEW.status='active' AND (SELECT actor_kind FROM iw_account_audit_context WHERE singleton=1)='system' THEN NEW.id ELSE (SELECT actor_id FROM iw_account_audit_context WHERE singleton=1) END,CASE WHEN OLD.role IS NOT NEW.role THEN 'member.role_changed' WHEN OLD.status='invited' AND NEW.status='active' THEN 'member.invitation_accepted' WHEN OLD.status='invited' AND NEW.status='inactive' THEN 'member.invitation_cancelled' WHEN NEW.status='invited' AND OLD.status IS NOT NEW.status THEN 'member.reinvited' WHEN NEW.status='inactive' AND OLD.status IS NOT NEW.status THEN 'member.deactivated' WHEN NEW.status='active' AND OLD.status IS NOT NEW.status THEN 'member.reactivated' ELSE 'member.profile_changed' END,'member:'||NEW.id,json_object('email',OLD.email,'displayName',OLD.display_name,'role',OLD.role,'status',OLD.status),json_object('email',NEW.email,'displayName',NEW.display_name,'role',NEW.role,'status',NEW.status));
END;

CREATE TRIGGER iw_audit_member_delete AFTER DELETE ON oa_operators
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member.deleted','member:'||OLD.id,json_object('email','[erased]','displayName','[erased]','role',OLD.role,'status',OLD.status),NULL);
END;

-- Redactions append a durable fence; original events never change.
CREATE TABLE iw_account_audit_redactions(target TEXT PRIMARY KEY,at TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE TRIGGER iw_account_audit_no_update BEFORE UPDATE ON iw_account_audit BEGIN SELECT RAISE(ABORT,'Account audit is append only'); END;
CREATE TRIGGER iw_account_audit_no_delete BEFORE DELETE ON iw_account_audit BEGIN SELECT RAISE(ABORT,'Account audit is append only'); END;
CREATE TRIGGER iw_account_redactions_no_update BEFORE UPDATE ON iw_account_audit_redactions BEGIN SELECT RAISE(ABORT,'Audit redactions are append only'); END;
CREATE TRIGGER iw_account_redactions_no_delete BEFORE DELETE ON iw_account_audit_redactions BEGIN SELECT RAISE(ABORT,'Audit redactions are append only'); END;
CREATE TRIGGER iw_audit_member_identity_erased AFTER DELETE ON oa_operators BEGIN
 INSERT OR IGNORE INTO iw_account_audit_redactions(target,at,actor_id) VALUES('member:'||OLD.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'system:erasure'));
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json) VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'system:erasure'),'member.identity_redacted','member:'||OLD.id,NULL,json_object('redacted',1));
END;

CREATE TRIGGER iw_audit_member_role_insert AFTER INSERT ON iw_member_roles
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member_role.assigned','member-role:'||NEW.operator_id,NULL,json_object('role',NEW.role));
END;

CREATE TRIGGER iw_audit_member_role_update AFTER UPDATE ON iw_member_roles
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.role IS NOT NEW.role)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member_role.changed','member-role:'||NEW.operator_id,json_object('role',OLD.role),json_object('role',NEW.role));
END;

CREATE TRIGGER iw_audit_member_role_delete AFTER DELETE ON iw_member_roles
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member_role.removed','member-role:'||OLD.operator_id,json_object('role',OLD.role),NULL);
END;

CREATE TRIGGER iw_audit_identity_settings_insert AFTER INSERT ON oa_auth_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_settings.created','settings:identity',NULL,json_object('idpSignIn',NEW.idp_sign_in,'firstSetup',NEW.first_setup));
END;

CREATE TRIGGER iw_audit_identity_settings_update AFTER UPDATE ON oa_auth_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.idp_sign_in IS NOT NEW.idp_sign_in OR OLD.first_setup IS NOT NEW.first_setup)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_settings.updated','settings:identity',json_object('idpSignIn',OLD.idp_sign_in,'firstSetup',OLD.first_setup),json_object('idpSignIn',NEW.idp_sign_in,'firstSetup',NEW.first_setup));
END;

CREATE TRIGGER iw_audit_identity_settings_delete AFTER DELETE ON oa_auth_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_settings.deleted','settings:identity',json_object('idpSignIn',OLD.idp_sign_in,'firstSetup',OLD.first_setup),NULL);
END;

CREATE TRIGGER iw_audit_domain_rule_insert AFTER INSERT ON oa_domain_rules
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'domain_rule.created','domain-rule:'||NEW.domain,NULL,json_object('domain',NEW.domain,'providerId',NEW.provider_id));
END;

CREATE TRIGGER iw_audit_domain_rule_update AFTER UPDATE ON oa_domain_rules
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.provider_id IS NOT NEW.provider_id)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'domain_rule.updated','domain-rule:'||NEW.domain,json_object('domain',OLD.domain,'providerId',OLD.provider_id),json_object('domain',NEW.domain,'providerId',NEW.provider_id));
END;

CREATE TRIGGER iw_audit_domain_rule_delete AFTER DELETE ON oa_domain_rules
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'domain_rule.deleted','domain-rule:'||OLD.domain,json_object('domain',OLD.domain,'providerId',OLD.provider_id),NULL);
END;

CREATE TRIGGER iw_audit_identity_provider_insert AFTER INSERT ON oa_identity_providers
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_provider.linked','identity-provider:'||NEW.provider_id,NULL,json_object('preset',NEW.preset,'status',NEW.status,'linkedAt',NEW.linked_at,'pending',NEW.pending_at IS NOT NULL,'configuration','[redacted]','tokenAuthMethod',NEW.token_auth_method,'responseIssuer',NEW.response_iss));
END;

CREATE TRIGGER iw_audit_identity_provider_update AFTER UPDATE ON oa_identity_providers
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.preset IS NOT NEW.preset OR OLD.status IS NOT NEW.status OR OLD.issuer IS NOT NEW.issuer OR OLD.client_id IS NOT NEW.client_id OR OLD.jwks_uri IS NOT NEW.jwks_uri OR OLD.authorization_endpoint IS NOT NEW.authorization_endpoint OR OLD.token_endpoint IS NOT NEW.token_endpoint OR OLD.algorithms IS NOT NEW.algorithms OR OLD.token_auth_method IS NOT NEW.token_auth_method OR OLD.response_iss IS NOT NEW.response_iss OR OLD.interface_version IS NOT NEW.interface_version OR OLD.linked_at IS NOT NEW.linked_at OR OLD.pending_issuer IS NOT NEW.pending_issuer OR OLD.pending_client_id IS NOT NEW.pending_client_id OR OLD.pending_preset IS NOT NEW.pending_preset OR OLD.pending_at IS NOT NEW.pending_at)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_provider.changed','identity-provider:'||NEW.provider_id,json_object('preset',OLD.preset,'status',OLD.status,'linkedAt',OLD.linked_at,'pending',OLD.pending_at IS NOT NULL,'configuration','[redacted]','tokenAuthMethod',OLD.token_auth_method,'responseIssuer',OLD.response_iss),json_object('preset',NEW.preset,'status',NEW.status,'linkedAt',NEW.linked_at,'pending',NEW.pending_at IS NOT NULL,'configuration','[redacted]','tokenAuthMethod',NEW.token_auth_method,'responseIssuer',NEW.response_iss));
END;

CREATE TRIGGER iw_audit_identity_provider_delete AFTER DELETE ON oa_identity_providers
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'identity_provider.removed','identity-provider:'||OLD.provider_id,json_object('preset',OLD.preset,'status',OLD.status,'linkedAt',OLD.linked_at,'pending',OLD.pending_at IS NOT NULL,'configuration','[redacted]','tokenAuthMethod',OLD.token_auth_method,'responseIssuer',OLD.response_iss),NULL);
END;

CREATE TRIGGER iw_audit_dependency_link_insert AFTER INSERT ON rer_dependency_link
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'dependency.linked','dependency:'||NEW.interface,NULL,json_object('interface',NEW.interface,'linkedAt',NEW.linked_at,'needsRelink',NEW.needs_relink,'configuration','[redacted]'));
END;

CREATE TRIGGER iw_audit_dependency_link_update AFTER UPDATE ON rer_dependency_link
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.issuer IS NOT NEW.issuer OR OLD.client_id IS NOT NEW.client_id OR OLD.metadata IS NOT NEW.metadata OR OLD.needs_relink IS NOT NEW.needs_relink OR OLD.linked_at IS NOT NEW.linked_at)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'dependency.changed','dependency:'||NEW.interface,json_object('interface',OLD.interface,'linkedAt',OLD.linked_at,'needsRelink',OLD.needs_relink,'configuration','[redacted]'),json_object('interface',NEW.interface,'linkedAt',NEW.linked_at,'needsRelink',NEW.needs_relink,'configuration','[redacted]'));
END;

CREATE TRIGGER iw_audit_dependency_link_delete AFTER DELETE ON rer_dependency_link
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'dependency.unlinked','dependency:'||OLD.interface,json_object('interface',OLD.interface,'linkedAt',OLD.linked_at,'needsRelink',OLD.needs_relink,'configuration','[redacted]'),NULL);
END;

CREATE TRIGGER iw_audit_setting_insert AFTER INSERT ON iw_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'setting.created','settings:'||NEW.key,NULL,json_object('value',CASE WHEN NEW.key='retention_years' AND NEW.value NOT GLOB '*[^0-9]*' AND length(NEW.value) BETWEEN 1 AND 3 THEN CAST(NEW.value AS INTEGER) WHEN NEW.key='completed_copies' AND NEW.value IN ('link','attachment') THEN NEW.value WHEN NEW.key='healthcare' THEN NEW.value WHEN NEW.key IN ('internal_approval','signing_groups') AND json_valid(NEW.value) THEN json(NEW.value) ELSE '[redacted]' END));
END;

CREATE TRIGGER iw_audit_setting_update AFTER UPDATE ON iw_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.value IS NOT NEW.value)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'setting.changed','settings:'||NEW.key,json_object('value',CASE WHEN OLD.key='retention_years' AND OLD.value NOT GLOB '*[^0-9]*' AND length(OLD.value) BETWEEN 1 AND 3 THEN CAST(OLD.value AS INTEGER) WHEN OLD.key='completed_copies' AND OLD.value IN ('link','attachment') THEN OLD.value WHEN OLD.key='healthcare' THEN OLD.value WHEN OLD.key IN ('internal_approval','signing_groups') AND json_valid(OLD.value) THEN json(OLD.value) ELSE '[redacted]' END),json_object('value',CASE WHEN NEW.key='retention_years' AND NEW.value NOT GLOB '*[^0-9]*' AND length(NEW.value) BETWEEN 1 AND 3 THEN CAST(NEW.value AS INTEGER) WHEN NEW.key='completed_copies' AND NEW.value IN ('link','attachment') THEN NEW.value WHEN NEW.key='healthcare' THEN NEW.value WHEN NEW.key IN ('internal_approval','signing_groups') AND json_valid(NEW.value) THEN json(NEW.value) ELSE '[redacted]' END));
END;

CREATE TRIGGER iw_audit_setting_delete AFTER DELETE ON iw_settings
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'setting.removed','settings:'||OLD.key,json_object('value',CASE WHEN OLD.key='retention_years' AND OLD.value NOT GLOB '*[^0-9]*' AND length(OLD.value) BETWEEN 1 AND 3 THEN CAST(OLD.value AS INTEGER) WHEN OLD.key='completed_copies' AND OLD.value IN ('link','attachment') THEN OLD.value WHEN OLD.key='healthcare' THEN OLD.value WHEN OLD.key IN ('internal_approval','signing_groups') AND json_valid(OLD.value) THEN json(OLD.value) ELSE '[redacted]' END),NULL);
END;

CREATE TRIGGER iw_audit_template_insert AFTER INSERT ON iw_templates
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template.created','template:'||NEW.id,NULL,json_object('title',json_extract(NEW.data,'$.title'),'filename',json_extract(NEW.data,'$.filename'),'version',COALESCE(json_extract(NEW.data,'$.version'),1),'originalSha256',json_extract(NEW.data,'$.originalSha256'),'folderId',NEW.folder_id,'tags',json_extract(NEW.data,'$.tags'),'roles',json((SELECT json_group_array(json_object('role',json_extract(value,'$.role'),'order',json_extract(value,'$.order'),'accessCode',json_extract(value,'$.accessCode'),'linkOnly',json_extract(value,'$.linkOnly'))) FROM json_each(NEW.data,'$.roles'))),'fields',json((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'signer',json_extract(value,'$.signer'),'page',json_extract(value,'$.page'),'x',json_extract(value,'$.x'),'y',json_extract(value,'$.y'),'width',json_extract(value,'$.width'),'height',json_extract(value,'$.height'),'required',json_extract(value,'$.required'),'requiredWhenField',json_extract(value,'$.requiredWhen.field'),'conditionField',json_extract(value,'$.condition.field'),'calculation',json_extract(value,'$.calculation'))) FROM json_each(NEW.data,'$.fields'))),'expiryDays',json_extract(NEW.data,'$.expiryDays'),'reminders',json_extract(NEW.data,'$.reminders'),'allowPaper',json_extract(NEW.data,'$.allowPaper'),'allowReassign',json_extract(NEW.data,'$.allowReassign')));
END;

CREATE TRIGGER iw_audit_template_update AFTER UPDATE ON iw_templates
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.data IS NOT NEW.data OR OLD.folder_id IS NOT NEW.folder_id)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template.updated','template:'||NEW.id,json_set(json_object('title',json_extract(OLD.data,'$.title'),'filename',json_extract(OLD.data,'$.filename'),'version',COALESCE(json_extract(OLD.data,'$.version'),1),'originalSha256',json_extract(OLD.data,'$.originalSha256'),'folderId',OLD.folder_id,'tags',json_extract(OLD.data,'$.tags'),'roles',json((SELECT json_group_array(json_object('role',json_extract(value,'$.role'),'order',json_extract(value,'$.order'),'accessCode',json_extract(value,'$.accessCode'),'linkOnly',json_extract(value,'$.linkOnly'))) FROM json_each(OLD.data,'$.roles'))),'fields',json((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'signer',json_extract(value,'$.signer'),'page',json_extract(value,'$.page'),'x',json_extract(value,'$.x'),'y',json_extract(value,'$.y'),'width',json_extract(value,'$.width'),'height',json_extract(value,'$.height'),'required',json_extract(value,'$.required'),'requiredWhenField',json_extract(value,'$.requiredWhen.field'),'conditionField',json_extract(value,'$.condition.field'),'calculation',json_extract(value,'$.calculation'))) FROM json_each(OLD.data,'$.fields'))),'expiryDays',json_extract(OLD.data,'$.expiryDays'),'reminders',json_extract(OLD.data,'$.reminders'),'allowPaper',json_extract(OLD.data,'$.allowPaper'),'allowReassign',json_extract(OLD.data,'$.allowReassign')),'$.definitionChanged',0),json_set(json_object('title',json_extract(NEW.data,'$.title'),'filename',json_extract(NEW.data,'$.filename'),'version',COALESCE(json_extract(NEW.data,'$.version'),1),'originalSha256',json_extract(NEW.data,'$.originalSha256'),'folderId',NEW.folder_id,'tags',json_extract(NEW.data,'$.tags'),'roles',json((SELECT json_group_array(json_object('role',json_extract(value,'$.role'),'order',json_extract(value,'$.order'),'accessCode',json_extract(value,'$.accessCode'),'linkOnly',json_extract(value,'$.linkOnly'))) FROM json_each(NEW.data,'$.roles'))),'fields',json((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'signer',json_extract(value,'$.signer'),'page',json_extract(value,'$.page'),'x',json_extract(value,'$.x'),'y',json_extract(value,'$.y'),'width',json_extract(value,'$.width'),'height',json_extract(value,'$.height'),'required',json_extract(value,'$.required'),'requiredWhenField',json_extract(value,'$.requiredWhen.field'),'conditionField',json_extract(value,'$.condition.field'),'calculation',json_extract(value,'$.calculation'))) FROM json_each(NEW.data,'$.fields'))),'expiryDays',json_extract(NEW.data,'$.expiryDays'),'reminders',json_extract(NEW.data,'$.reminders'),'allowPaper',json_extract(NEW.data,'$.allowPaper'),'allowReassign',json_extract(NEW.data,'$.allowReassign')),'$.definitionChanged',CASE WHEN OLD.data IS NOT NEW.data THEN 1 ELSE 0 END));
END;

CREATE TRIGGER iw_audit_template_delete AFTER DELETE ON iw_templates
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template.deleted','template:'||OLD.id,json_object('title',json_extract(OLD.data,'$.title'),'filename',json_extract(OLD.data,'$.filename'),'version',COALESCE(json_extract(OLD.data,'$.version'),1),'originalSha256',json_extract(OLD.data,'$.originalSha256'),'folderId',OLD.folder_id,'tags',json_extract(OLD.data,'$.tags'),'roles',json((SELECT json_group_array(json_object('role',json_extract(value,'$.role'),'order',json_extract(value,'$.order'),'accessCode',json_extract(value,'$.accessCode'),'linkOnly',json_extract(value,'$.linkOnly'))) FROM json_each(OLD.data,'$.roles'))),'fields',json((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'signer',json_extract(value,'$.signer'),'page',json_extract(value,'$.page'),'x',json_extract(value,'$.x'),'y',json_extract(value,'$.y'),'width',json_extract(value,'$.width'),'height',json_extract(value,'$.height'),'required',json_extract(value,'$.required'),'requiredWhenField',json_extract(value,'$.requiredWhen.field'),'conditionField',json_extract(value,'$.condition.field'),'calculation',json_extract(value,'$.calculation'))) FROM json_each(OLD.data,'$.fields'))),'expiryDays',json_extract(OLD.data,'$.expiryDays'),'reminders',json_extract(OLD.data,'$.reminders'),'allowPaper',json_extract(OLD.data,'$.allowPaper'),'allowReassign',json_extract(OLD.data,'$.allowReassign')),NULL);
END;

CREATE TRIGGER iw_audit_template_folder_insert AFTER INSERT ON iw_template_folders
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_folder.created','template-folder:'||NEW.id,NULL,json_object('name',NEW.name,'ownerId',NEW.owner_id));
END;

CREATE TRIGGER iw_audit_template_folder_update AFTER UPDATE ON iw_template_folders
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.name IS NOT NEW.name OR OLD.owner_id IS NOT NEW.owner_id)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_folder.updated','template-folder:'||NEW.id,json_object('name',OLD.name,'ownerId',OLD.owner_id),json_object('name',NEW.name,'ownerId',NEW.owner_id));
END;

CREATE TRIGGER iw_audit_template_folder_delete AFTER DELETE ON iw_template_folders
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_folder.deleted','template-folder:'||OLD.id,json_object('name',OLD.name,'ownerId',OLD.owner_id),NULL);
END;

CREATE TRIGGER iw_audit_template_share_insert AFTER INSERT ON iw_template_shares
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_share.granted','template-share:'||NEW.subject||':'||NEW.subject_id||':'||NEW.operator_id,NULL,json_object('subject',NEW.subject,'subjectId',NEW.subject_id,'operatorId',NEW.operator_id,'access',NEW.access));
END;

CREATE TRIGGER iw_audit_template_share_update AFTER UPDATE ON iw_template_shares
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.access IS NOT NEW.access)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_share.changed','template-share:'||NEW.subject||':'||NEW.subject_id||':'||NEW.operator_id,json_object('subject',OLD.subject,'subjectId',OLD.subject_id,'operatorId',OLD.operator_id,'access',OLD.access),json_object('subject',NEW.subject,'subjectId',NEW.subject_id,'operatorId',NEW.operator_id,'access',NEW.access));
END;

CREATE TRIGGER iw_audit_template_share_delete AFTER DELETE ON iw_template_shares
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'template_share.revoked','template-share:'||OLD.subject||':'||OLD.subject_id||':'||OLD.operator_id,json_object('subject',OLD.subject,'subjectId',OLD.subject_id,'operatorId',OLD.operator_id,'access',OLD.access),NULL);
END;

CREATE TRIGGER iw_audit_notice_preference_insert AFTER INSERT ON iw_notice_prefs
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_preference.created','notice-preference:'||NEW.operator_id||':'||NEW.event||':'||NEW.channel,NULL,json_object('event',NEW.event,'channel',NEW.channel,'enabled',NEW.enabled));
END;

CREATE TRIGGER iw_audit_notice_preference_update AFTER UPDATE ON iw_notice_prefs
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.enabled IS NOT NEW.enabled)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_preference.updated','notice-preference:'||NEW.operator_id||':'||NEW.event||':'||NEW.channel,json_object('event',OLD.event,'channel',OLD.channel,'enabled',OLD.enabled),json_object('event',NEW.event,'channel',NEW.channel,'enabled',NEW.enabled));
END;

CREATE TRIGGER iw_audit_notice_preference_delete AFTER DELETE ON iw_notice_prefs
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_preference.deleted','notice-preference:'||OLD.operator_id||':'||OLD.event||':'||OLD.channel,json_object('event',OLD.event,'channel',OLD.channel,'enabled',OLD.enabled),NULL);
END;

CREATE TRIGGER iw_audit_notice_channel_insert AFTER INSERT ON iw_notice_channels
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_channel.connected','notice-channel:'||NEW.operator_id||':'||NEW.channel,NULL,json_object('channel',NEW.channel,'webhook','[configured; URL redacted]'));
END;

CREATE TRIGGER iw_audit_notice_channel_update AFTER UPDATE ON iw_notice_channels
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.sealed IS NOT NEW.sealed OR OLD.masked IS NOT NEW.masked)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_channel.changed','notice-channel:'||NEW.operator_id||':'||NEW.channel,json_object('channel',OLD.channel,'webhook','[configured; URL redacted]'),json_object('channel',NEW.channel,'webhook','[configured; URL redacted]'));
END;

CREATE TRIGGER iw_audit_notice_channel_delete AFTER DELETE ON iw_notice_channels
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'notice_channel.disconnected','notice-channel:'||OLD.operator_id||':'||OLD.channel,json_object('channel',OLD.channel,'webhook','[configured; URL redacted]'),NULL);
END;

CREATE TRIGGER iw_audit_agent_key_insert AFTER INSERT ON iw_agents
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'agent_key.issued','agent-key:'||NEW.id,NULL,json_object('ownerId',NEW.owner_id,'createdAt',NEW.created_at,'revokedAt',NEW.revoked_at));
END;

CREATE TRIGGER iw_audit_agent_key_update AFTER UPDATE ON iw_agents
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'agent_key.revoked','agent-key:'||NEW.id,json_object('ownerId',OLD.owner_id,'createdAt',OLD.created_at,'revokedAt',OLD.revoked_at),json_object('ownerId',NEW.owner_id,'createdAt',NEW.created_at,'revokedAt',NEW.revoked_at));
END;

CREATE TRIGGER iw_audit_agent_key_delete AFTER DELETE ON iw_agents
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'agent_key.removed','agent-key:'||OLD.id,json_object('ownerId',OLD.owner_id,'createdAt',OLD.created_at,'revokedAt',OLD.revoked_at),NULL);
END;

CREATE TRIGGER iw_audit_invitation_issued AFTER INSERT ON oa_tokens
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (NEW.kind='invite')
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member.invitation_issued','invitation:'||NEW.operator_id,NULL,json_object('operatorId',NEW.operator_id,'expiresAt',NEW.expires_at));
END;

CREATE TRIGGER iw_audit_session_revoked AFTER UPDATE ON oa_sessions
WHEN EXISTS(SELECT 1 FROM iw_account_audit_context WHERE singleton=1) AND (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
BEGIN
 INSERT INTO iw_account_audit(id,at,actor_id,action,target,before_json,after_json)
 VALUES(lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'),(SELECT actor_id FROM iw_account_audit_context WHERE singleton=1),'member_session.revoked','member-session:'||NEW.operator_id,json_object('kind',OLD.kind,'revoked',0),json_object('kind',NEW.kind,'revoked',1));
END;

CREATE VIEW iw_account_audit_visible AS SELECT a.id,a.at,a.actor_id,a.action,a.target,
 CASE WHEN r.target IS NULL OR a.before_json IS NULL THEN a.before_json ELSE json_set(a.before_json,'$.email','[erased]','$.displayName','[erased]') END AS before_json,
 CASE WHEN r.target IS NULL OR a.after_json IS NULL THEN a.after_json ELSE json_set(a.after_json,'$.email','[erased]','$.displayName','[erased]') END AS after_json
 FROM iw_account_audit a LEFT JOIN iw_account_audit_redactions r ON a.target=r.target AND a.action LIKE 'member.%';
