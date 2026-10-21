import { id, now, type Envelope, type Env } from './model'
import { noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'

/** ADMIN-004 A8: a held send always reaches its principal and every active owner/admin in Activity.
 * Mail, when configured, is queued in the same atomic change as the hold, after pending mail is cancelled. */
export async function heldNoticeWrites(env: Env, envelope: Envelope, principal: string) {
  const members = (await env.DB.prepare("SELECT id,email,display_name AS name FROM oa_operators WHERE status='active' AND (id=? OR role IN ('owner','admin'))").bind(principal).all<{ id: string; email: string; name: string }>()).results
  const event = envelope.events.findLast(e => e.action === 'envelope.send_held')!, at = now()
  const reason = String(event.detail.reason), app = new URL('/app', env.AUTH_ORIGIN).href
  return members.flatMap(member => [
    env.DB.prepare('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)').bind(id(), member.id, envelope.id, 'send_held', at, envelope.title, reason),
    ...(!mailSuppressed(env) ? [noticeWrite(env.DB, envelope, 0, member.email, `Sending held: ${envelope.title}`, `${member.name},\n\nSending ${envelope.title} is held. No signing invitation was sent.\n${reason}\nA current editor must review and confirm again; turning a policy back on does not release it.\n${app}`)] : []),
  ])
}
