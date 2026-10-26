import { invalidateExitStatements } from './exit-export'
import { archiveMailErasure } from './imports/retention-mail-erasure'
import type { createPortability } from '@runeditrun/rer/modules/portability'

type Portability = Awaited<ReturnType<typeof createPortability>>
/** The writes that permanently erase one envelope: its documents, events, recipients, mail and their provider delivery
 * events, codes, copy links, shares, activity-feed notices (DELIV-008) and command results, with Base's erasure record so
 * an earlier archive's restore is refused naming the erasure. The owner's erase and RECORD-005's purge both use it. */
export async function erasureWrites(db: D1Database, service: Portability, envelopeId: string) {
 const deleted = ['iw_payments','iw_embed_launches','iw_embed_audit','iw_filing_jobs','iw_provider_auth','iw_sms','iw_part11_security_alerts','iw_part11_challenges','iw_comment_threads','iw_followup_grants','iw_followup_states','iw_followup_replies','iw_followup_capabilities','iw_blobs','iw_events','iw_signers','iw_mail','iw_access_codes','iw_copy_links','iw_shares'].map(table => db.prepare(`DELETE FROM ${table} WHERE envelope_id=?`).bind(envelopeId))
 return [
  ...await invalidateExitStatements(db,envelopeId),
  db.prepare("DELETE FROM iw_embed_audit WHERE json_extract(detail,'$.allocation')=?").bind(envelopeId),
  ...archiveMailErasure([`envelope:${envelopeId}`]).map(s=>db.prepare(s.sql).bind(...s.params??[])),
  ...await service.redactionStatements(), ...await service.erasureStatements('iw_envelopes',{id:envelopeId}), ...await service.invalidateTransfersStatements(),
  db.prepare("DELETE FROM rer_mail_development_outbox WHERE json_extract(message,'$.deliveryId') IN (SELECT id FROM iw_mail WHERE envelope_id=?)").bind(envelopeId),
  // DELIV-001: provider delivery events name the recipient; erase them with the messages they describe.
  db.prepare("DELETE FROM rer_mail_event_states WHERE EXISTS(SELECT 1 FROM rer_mail_event_receipts r JOIN iw_mail m ON m.envelope_id=? AND r.provider=m.provider AND (json_extract(r.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(r.event_json,'$.deliveryId')=m.id) WHERE r.provider=rer_mail_event_states.provider AND r.tenant_id=rer_mail_event_states.tenant_id AND json_extract(r.event_json,'$.providerMessageId')=rer_mail_event_states.provider_message_id)").bind(envelopeId),
  db.prepare("DELETE FROM rer_mail_event_receipts WHERE EXISTS(SELECT 1 FROM iw_mail m WHERE m.envelope_id=? AND rer_mail_event_receipts.provider=m.provider AND (json_extract(rer_mail_event_receipts.event_json,'$.providerMessageId')=m.provider_message_id OR json_extract(rer_mail_event_receipts.event_json,'$.deliveryId')=m.id))").bind(envelopeId),
  // DELIV-008: feed notices name the envelope and a recipient.
  db.prepare('DELETE FROM iw_notice_posts WHERE notice_id IN (SELECT id FROM iw_notices WHERE envelope_id=?)').bind(envelopeId), db.prepare('DELETE FROM iw_notices WHERE envelope_id=?').bind(envelopeId),
  ...deleted, db.prepare('DELETE FROM iw_envelopes WHERE id=?').bind(envelopeId),
  // Command results and local mail can retain identity/link fragments. Delete
  // this envelope's command results and messages, never another document's rows.
  db.prepare("DELETE FROM iw_commands WHERE json_extract(result,'$.id')=?").bind(envelopeId),
 ]
}
