import { id, now, type Env } from '../model'
import { noticeWrite } from '../mail'
import type { SigningContext } from '../signing'
/** Security mail is mandatory and independent of personal activity preferences. No code, password or private link. */
export async function securityAlertWrites(env: Env, c: SigningContext, cause: string) {
  const exists=await env.DB.prepare('SELECT 1 FROM iw_part11_security_alerts WHERE envelope_id=? AND signer=? AND cause=?').bind(c.envelope.id,c.recipient.row,cause).first()
  if(exists)return []
  const contacts=(await env.DB.prepare("SELECT id,email FROM oa_operators WHERE status='active' AND role IN ('owner','admin') ORDER BY id").all<{id:string;email:string}>()).results
  const at=now()
  return [env.DB.prepare('INSERT INTO iw_part11_security_alerts VALUES(?,?,?,?,?,?)').bind(id(),c.envelope.id,c.recipient.row,cause,at,JSON.stringify(contacts)),...contacts.map(contact=>noticeWrite(env.DB,c.envelope,c.recipient.signer,contact.email,'Inkwell security alert: signing attempts exhausted',`Unauthorized signature attempts require review.\nEnvelope: ${c.envelope.id}\nRecipient place: ${c.recipient.signer+1}\nCause: ${cause}\nTime (UTC): ${at}\nReview Part 11 administration in Settings.`))]
}
