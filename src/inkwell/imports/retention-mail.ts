import { operatorMail } from '../../mail.server.mjs'
import { deliveryMessages, type DeliveryMessageRow } from '../delivery'
import { insist, type Env } from '../model'

/** A durable one-attempt mail edge. Uncertain delivery stays visible and is never blindly retried. */
export async function dispatchArchiveRetentionMail(env: Env) {
 const sender = operatorMail(env)
 const rows = (await env.DB.prepare("SELECT id FROM iw_import_retention_mail WHERE state='pending'").all<{id:string}>()).results
 for (const row of rows) {
  const mail = await env.DB.prepare("UPDATE iw_import_retention_mail SET state='sending' WHERE id=? AND state='pending' RETURNING recipient,subject,body").bind(row.id).first<{recipient:string;subject:string;body:string}>()
  if (!mail) continue
  let state = 'uncertain', messageId:string|null=null
  try {
   insist(sender && env.MAIL_FROM, 'Email delivery is not configured.', 503)
   const result = await sender.send({deliveryId:row.id,from:env.MAIL_FROM,to:[mail.recipient],subject:mail.subject,text:mail.body,html:`<p>${mail.body.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]!)).replaceAll("\n","<br>")}</p>`,headers:{}})
   state = ['accepted','development'].includes(result.status) ? 'sent' : result.status
   messageId=result.providerMessageId??null
  } catch { state='uncertain' } finally {
   await env.DB.prepare('UPDATE iw_import_retention_mail SET state=?,provider=?,provider_message_id=?,sent_at=CASE WHEN ?=\'sent\' THEN ? END,body=CASE WHEN ?=\'sent\' THEN \'\' ELSE body END WHERE id=?').bind(state,env.MAIL_PROVIDER??null,messageId,state,new Date().toISOString(),state,row.id).run()
  }
  insist(state === 'sent', 'Retention warning delivery could not be confirmed.', 503)
 }
}

/** Warning delivery facts for a source archive (or `envelope:<id>`), without private provider IDs. */
export async function archiveRetentionMessages(env:Env,groupId:string) {
 const rows=(await env.DB.prepare("SELECT id,'retention' AS kind,0 AS signer,recipient,subject,state,provider,provider_message_id,created_at,sent_at FROM iw_import_retention_mail WHERE group_id=? ORDER BY created_at,rowid").bind(groupId).all<DeliveryMessageRow>()).results
 return deliveryMessages(env,rows)
}
