import type { D1Sql } from '../../modules/import-kit/src/d1/index'

/** RECORD-005 / DELIV-001: erase warning delivery custody before removing its queue rows. */
export function archiveMailErasure(jobs: string[]): D1Sql[] {
 const groups = JSON.stringify(jobs)
 return [
  { sql: "DELETE FROM rer_mail_development_outbox WHERE json_extract(message,'$.deliveryId') IN (SELECT id FROM iw_import_retention_mail WHERE group_id IN (SELECT value FROM json_each(?)))", params: [groups] },
  { sql: "DELETE FROM rer_mail_event_states WHERE EXISTS(SELECT 1 FROM rer_mail_event_receipts r JOIN iw_import_retention_mail m ON m.group_id IN (SELECT value FROM json_each(?)) AND r.provider=m.provider AND (json_extract(r.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(r.event_json,'$.deliveryId')=m.id) WHERE r.provider=rer_mail_event_states.provider AND r.tenant_id=rer_mail_event_states.tenant_id AND json_extract(r.event_json,'$.providerMessageId')=rer_mail_event_states.provider_message_id)", params: [groups] },
  { sql: "DELETE FROM rer_mail_event_receipts WHERE EXISTS(SELECT 1 FROM iw_import_retention_mail m WHERE m.group_id IN (SELECT value FROM json_each(?)) AND rer_mail_event_receipts.provider=m.provider AND (json_extract(rer_mail_event_receipts.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(rer_mail_event_receipts.event_json,'$.deliveryId')=m.id))", params: [groups] },
  { sql: 'DELETE FROM iw_import_retention_mail WHERE group_id IN (SELECT value FROM json_each(?))', params: [groups] },
 ]
}
