-- Read budget: an envelope is one JSON row, so every status or date filter was a full scan, and the hourly pass, the
-- minute cron and the dashboard cost more rows with every envelope kept. These indexes match the predicates as written
-- (the expressions must stay byte-for-byte the ones the queries use) so those paths read only the rows they act on.
CREATE INDEX IF NOT EXISTS iw_envelopes_status ON iw_envelopes(json_extract(data,'$.status'), json_extract(data,'$.createdAt'), id);
CREATE INDEX IF NOT EXISTS iw_envelopes_created ON iw_envelopes(json_extract(data,'$.createdAt'), id);
CREATE INDEX IF NOT EXISTS iw_envelopes_imported ON iw_envelopes(id) WHERE json_extract(data,'$.imported')=1;
CREATE INDEX IF NOT EXISTS iw_mail_envelope ON iw_mail(envelope_id, kind, state);
CREATE INDEX IF NOT EXISTS iw_import_retention_mail_group ON iw_import_retention_mail(group_id);
-- Delivery receipts are looked up by the provider's message id or the delivery id inside the stored event.
CREATE INDEX IF NOT EXISTS iw_receipts_message ON rer_mail_event_receipts(provider, json_extract(event_json,'$.providerMessageId'));
CREATE INDEX IF NOT EXISTS iw_receipts_delivery ON rer_mail_event_receipts(provider, json_extract(event_json,'$.deliveryId'));
CREATE INDEX IF NOT EXISTS iw_followup_grants_state ON iw_followup_grants(state);
CREATE INDEX IF NOT EXISTS iw_hubspot_envelopes_status ON iw_hubspot_envelopes(status, authorized_at);
CREATE INDEX IF NOT EXISTS iw_salesforce_envelopes_status ON iw_salesforce_envelopes(status, authorized_at);
CREATE INDEX IF NOT EXISTS iw_form_submissions_at ON iw_form_submissions(at);
CREATE INDEX IF NOT EXISTS iw_form_challenges_created ON iw_form_challenges(created_at);
CREATE INDEX IF NOT EXISTS iw_remote_jobs_state ON iw_remote_jobs(json_extract(data,'$.state'));
CREATE INDEX IF NOT EXISTS iw_remote_previews_expiry ON iw_remote_previews(expires_at);
CREATE INDEX IF NOT EXISTS iw_remote_job_pages_preview ON iw_remote_job_pages(preview_id);
-- Open envelopes by expiry, and envelopes waiting for a scheduled send: the cron reads only these.
CREATE INDEX IF NOT EXISTS iw_envelopes_expiry ON iw_envelopes(json_extract(data,'$.status'), json_extract(data,'$.expiresAt'));
CREATE INDEX IF NOT EXISTS iw_envelopes_scheduled ON iw_envelopes(json_extract(data,'$.scheduled.at')) WHERE json_extract(data,'$.scheduled.at') IS NOT NULL;
CREATE INDEX IF NOT EXISTS iw_filing_jobs_state ON iw_filing_jobs(state);
