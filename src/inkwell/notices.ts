import { sha256, id, insist, now, object, type Actor, type AuditEvent, type Env, type Envelope } from './model'
import { noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'
import { seal, unseal } from './seal'

// DELIV-008: sender notifications. When an envelope records one of these events, everyone who sent it or holds an edit
// share of it (ADMIN-001) gets a notice in their in-app activity feed, always, and by email, Slack, Microsoft Teams or Nook
// as each of them chose. A notice names the envelope, the recipient and what happened; by email a decline also gives its
// reason. A channel post is tried at most three times and its outcome shows on the feed. Webhook URLs are sealed at rest
// (seal.ts), shown only masked, never archived, and a post goes to the URL connected when it is sent.
export const noticeEvents = ['viewed', 'signed', 'declined', 'completed', 'bounced', 'expiring', 'approval'] as const
export const noticeChannels = ['email', 'slack', 'teams', 'nook'] as const
type NoticeEvent = typeof noticeEvents[number]
type Channel = typeof noticeChannels[number]
type Hook = Exclude<Channel, 'email'>
const kinds: Record<string, NoticeEvent> = { 'signer.viewed': 'viewed', 'signer.signed': 'signed', 'signer.signed_on_paper': 'signed', 'signer.declined': 'declined', 'signer.consent_withdrawn': 'declined', 'envelope.completed': 'completed', 'signer.bounced': 'bounced', 'envelope.expiry_warned': 'expiring', 'envelope.internal_approval_requested': 'approval', 'envelope.internal_approved': 'approval', 'envelope.internal_rejected': 'approval' }
/** Until a person chooses: email for declined, completed, bounced and expiring; nothing else outside the feed. */
const byDefault = (event: NoticeEvent, channel: Channel) => channel === 'email' && !['viewed', 'signed'].includes(event)
// Slack's and Teams' incoming webhooks live on their own hosts; Nook's Slack-compatible ones (NOOK-063) on the
// installation's own https origin under /hooks/slack/.
const hookRules: Record<Hook, { label: string; valid: (url: URL) => boolean; example: string }> = {
  slack: { label: 'Slack', valid: url => url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/'), example: 'https://hooks.slack.com/services/…' },
  teams: { label: 'Microsoft Teams', valid: url => /\.(webhook\.office\.com|logic\.azure\.com|environment\.api\.powerplatform\.com)$/.test(url.hostname), example: 'https://<tenant>.webhook.office.com/… or a Workflows URL' },
  nook: { label: 'Nook', valid: url => url.pathname.startsWith('/hooks/slack/'), example: 'https://<your Nook>/hooks/slack/…' },
}
const labels: Record<NoticeEvent, string> = { viewed: 'Viewed', signed: 'Signed', declined: 'Declined', completed: 'Completed', bounced: 'Bounced', expiring: 'Expires soon', approval: 'Internal approval' }
const mask = (url: URL) => `${url.origin}/…${url.pathname.slice(-4)}`
const purpose = 'notice-webhook-seal', bound = (operator: string, channel: Hook) => `${operator}:${channel}`

type Member = { id: string; email: string; name: string }
/** `to`: the members a notice is for, instead of the envelope's sender and edit shares (ROUTE-004's approvers). */
type Notice = { event: NoticeEvent; signer: number; actor?: string; to?: string[]; recipient: string; line: string; subject: string; body: (name: string) => string }

/** What one new audit event tells the sender, or nothing for events that are not notices. */
function describe(env: Env, envelope: Envelope, event: AuditEvent): Notice | undefined {
  const kind = kinds[event.action]
  if (!kind) return undefined
  if (kind === 'approval') return approvalNotice(env, envelope, event)
  const d = event.detail, who = typeof d.signer === 'number' ? envelope.signers[d.signer]?.name ?? '' : '', title = envelope.title, app = new URL('/app', env.AUTH_ORIGIN).href
  const waiting = Array.isArray(d.signers) ? d.signers.map(i => envelope.signers[i as number]?.name).filter(Boolean).join(' and ') : ''
  const withdrawn = event.action === 'signer.consent_withdrawn'
  const line = { viewed: `${who} viewed ${title}.`, signed: `${who} signed ${title}.`, declined: `${who} ${withdrawn ? 'withdrew consent for' : 'declined to sign'} ${title}.`, completed: `Everyone has signed ${title}.`, bounced: `The invitation to ${who} for ${title} could not be delivered.`, expiring: `${title} expires ${envelope.expiresAt}${waiting ? ` and is waiting for ${waiting}` : ''}.` }[kind]
  const body = {
    viewed: () => `${line}\n${app}`, signed: () => `${line}\n${app}`, completed: () => `${line} The executed PDF and certificate are in Inkwell.\n${app}`,
    declined: () => `${who} ${withdrawn ? 'withdrew consent to electronic records and signatures for' : 'declined to sign'} ${title}.\nReason: ${String(d.reason ?? '')}\n\nThe envelope has stopped and no further recipients will be invited.`,
    bounced: () => `The invitation to ${who} at ${String(d.email ?? '')} could not be delivered (${String(d.status ?? 'bounced')}). Reminders to them are paused.\n\nOpen the envelope in Inkwell, correct their email address and the new invitation goes out at once.\n${app}`,
    expiring: () => `${line}\nExtend it from the envelope in Inkwell if they need more time.`,
  }[kind]
  return { event: kind, signer: typeof d.signer === 'number' ? d.signer : Array.isArray(d.signers) && typeof d.signers[0] === 'number' ? d.signers[0] : 0, recipient: who, line, subject: `${withdrawn ? 'Consent withdrawn' : labels[kind]}: ${title}`, body: name => `${name},\n\n${body()}` }
}

/** ROUTE-004: a request goes to the approvers still to decide; an approval or rejection (with its reason) to the sender. */
function approvalNotice(env: Env, envelope: Envelope, event: AuditEvent): Notice {
  const d = event.detail, title = envelope.title, app = new URL('/app', env.AUTH_ORIGIN).href, request = envelope.internalApproval!
  if (event.action === 'envelope.internal_approval_requested') {
    const line = `${request.requestedBy.name} asks you to approve ${title} before it is sent.`
    return { event: 'approval', signer: 0, actor: request.requestedBy.email, to: request.steps.filter(s => !s.decision).map(s => s.approver), recipient: `Approval needed, from ${request.requestedBy.name}`, line, subject: `Approval needed: ${title}`, body: name => `${name},\n\n${line}\nWhy: ${request.steps.filter(s => !s.decision).flatMap(s => s.why).join('; ')}\n\nOpen it in Inkwell to approve or reject it. Nothing is sent until every named approver approves.\n${app}` }
  }
  const rejected = event.action === 'envelope.internal_rejected', who = String(d.name ?? ''), approver = request.steps.find(s => s.approver === d.approver)
  const line = rejected ? `${who} rejected ${title}: ${String(d.reason ?? '')}` : `${who} approved ${title}.`
  return { event: 'approval', signer: 0, actor: approver?.email, recipient: rejected ? `Rejected by ${who}` : `Approved by ${who}`, line, subject: `${rejected ? 'Rejected' : 'Approved'}: ${title}`, body: name => `${name},\n\n${line}\n\n${rejected ? 'It is back in your drafts. Edit it and approve it again to send it.' : 'It is sent once every named approver has approved.'}\n${app}` }
}

/** The writes that record and send the notices for the events `after` adds to `before`, in the same batch as the change. */
export async function noticeWrites(env: Env, before: Envelope, after: Envelope): Promise<D1PreparedStatement[]> {
  if(after.testMode)return []
  // The recipient who acted: the event's own, or for a completion the last to sign in this change. A member is never
  // emailed or posted about their own action (ROUTE-009: signing your own document sends nothing); the feed still has it.
  let last: number | undefined
  const notices = after.events.slice(before.events.length).flatMap(event => { if (typeof event.detail.signer === 'number') last = event.detail.signer; const notice = describe(env, after, event); return notice ? [{ ...notice, actor: notice.actor ?? (last === undefined ? undefined : after.signers[last]?.email.toLowerCase()) }] : [] })
  if (!notices.length) return []
  const db = env.DB, named = [...new Set(notices.flatMap(n => n.to ?? []))]
  const members = (await db.prepare(`SELECT id, email, display_name AS name, (id=?1 OR id IN (SELECT operator_id FROM iw_shares WHERE envelope_id=?2 AND access='edit')) AS standard FROM oa_operators WHERE status='active' AND (id=?1 OR id IN (SELECT operator_id FROM iw_shares WHERE envelope_id=?2 AND access='edit')${named.length ? ` OR id IN (${named.map((_, i) => `?${i + 3}`).join(',')})` : ''})`).bind(after.createdBy, after.id, ...named).all<Member & { standard: number }>()).results
  if (!members.length) return []
  const ids = members.map(m => m.id), marks = ids.map(() => '?').join(',')
  const prefs = (await db.prepare(`SELECT operator_id, event, channel, enabled FROM iw_notice_prefs WHERE operator_id IN (${marks})`).bind(...ids).all<{ operator_id: string; event: string; channel: string; enabled: number }>()).results
  const hooks = (await db.prepare(`SELECT operator_id, channel, sealed FROM iw_notice_channels WHERE operator_id IN (${marks})`).bind(...ids).all<{ operator_id: string; channel: Hook; sealed: string }>()).results
  const wants = (member: string, event: NoticeEvent, channel: Channel) => { const row = prefs.find(p => p.operator_id === member && p.event === event && p.channel === channel); return row ? row.enabled === 1 : byDefault(event, channel) }
  // With mail not set up no notice email is written (SEND-001); the feed and the channels still get it.
  const at = now(), email = !mailSuppressed(env), writes: D1PreparedStatement[] = []
  for (const notice of notices) for (const member of members.filter(m => notice.to ? notice.to.includes(m.id) : m.standard)) {
    const noticeId = id()
    writes.push(db.prepare('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)').bind(noticeId, member.id, after.id, notice.event, at, after.title, notice.recipient))
    const own = notice.actor === member.email.toLowerCase()
    if (email && !own && wants(member.id, notice.event, 'email')) writes.push(noticeWrite(db, after, notice.signer, member.email, notice.subject, notice.body(member.name)))
    for (const hook of hooks.filter(h => !own && h.operator_id === member.id && wants(member.id, notice.event, h.channel)))
      writes.push(db.prepare('INSERT INTO iw_notice_posts(id,notice_id,operator_id,channel,body,connection) VALUES(?,?,?,?,?,?)').bind(id(), noticeId, member.id, hook.channel, JSON.stringify(hook.channel === 'teams' ? { text: notice.line } : { text: notice.line, username: 'Inkwell' }), await sha256(hook.sealed)))
  }
  return writes
}

/** A confirmed refusal can be reviewed after replacing the connection. Unknown effects never retry. */
export async function dispatchNotices(env: Env) {
  const posts = (await env.DB.prepare("SELECT p.id,p.operator_id,p.channel,p.body,p.connection,c.sealed FROM iw_notice_posts p LEFT JOIN iw_notice_channels c ON c.operator_id=p.operator_id AND c.channel=p.channel WHERE p.state='pending' AND p.attempts<3 LIMIT 50").all<{id:string;operator_id:string;channel:Hook;body:string;connection:string|null;sealed:string|null}>()).results
  for (const post of posts) {
    if (!post.sealed || post.connection !== await sha256(post.sealed)) {
      await env.DB.prepare("UPDATE iw_notice_posts SET state='held',repairable=1,result='Connection changed or disconnected; owner review required.' WHERE id=? AND state='pending' AND connection IS ? AND (SELECT sealed FROM iw_notice_channels WHERE operator_id=? AND channel=?) IS ?").bind(post.id,post.connection,post.operator_id,post.channel,post.sealed).run()
      continue
    }
    const claimed=await env.DB.prepare("UPDATE iw_notice_posts SET state='sending',attempts=attempts+1,repairable=0 WHERE id=? AND state='pending' AND connection=? AND EXISTS(SELECT 1 FROM iw_notice_channels WHERE operator_id=? AND channel=? AND sealed=?) RETURNING id").bind(post.id,post.connection,post.operator_id,post.channel,post.sealed).first()
    if(!claimed)continue
    const url=await unseal(env,purpose,bound(post.operator_id,post.channel),post.sealed)
    let state='uncertain',result='Unconfirmed provider effect; do not replay.',repairable=0
    if(!url){state='held';result='Connection unavailable; owner review required.';repairable=1}
    else try {
      const response=await fetch(url,{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:post.body,signal:AbortSignal.timeout(15000)})
      // Only the provider's explicit acceptance or refusal is decisive. Never persist its response body.
      const answer=(await response.text()).trim()
      if(response.ok&&(post.channel==='teams'?['1','ok'].includes(answer):answer==='ok')){state='sent';result='delivered'}
      else if([401,403,404,410].includes(response.status)){state='held';repairable=1;result='Provider refused the connection; replace it and request owner review.'}
    }catch{ /* An unanswered request may have been accepted remotely. */ }
    await env.DB.prepare("UPDATE iw_notice_posts SET state=?,result=?,repairable=? WHERE id=? AND state='sending'").bind(state,result,repairable,post.id).run()
  }
}

/** The signed-in person's activity feed, newest first, 50 at a time, each with how its channel posts went. */
export async function activityFeed(env: Env, actor: Actor, params: URLSearchParams) {
  const before = params.get('before') ?? ''
  insist(!before || !Number.isNaN(Date.parse(before)), 'Provide before as a time.')
  const rows = (await env.DB.prepare(`SELECT id, envelope_id AS envelopeId, event, at, title, recipient FROM iw_notices WHERE operator_id=? AND (event!='usage_cap' OR ? IN ('owner','admin'))${before ? ' AND at<?' : ''} ORDER BY at DESC, rowid DESC LIMIT 50`).bind(actor.id, actor.role, ...(before ? [before] : [])).all<{ id: string; envelopeId: string; event: string; at: string; title: string; recipient: string }>()).results
  const posts = rows.length ? (await env.DB.prepare(`SELECT notice_id, channel, state, result FROM iw_notice_posts WHERE notice_id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).all<{ notice_id: string; channel: Hook; state: string; result: string }>()).results : []
  return { notices: rows.map(row => ({ ...row, posts: posts.filter(p => p.notice_id === row.id).map(p => ({ channel: p.channel, state: p.state, result: p.result })) })) }
}

/** The person's choices per event and channel, and which channels they connected (URLs masked). */
export async function noticeSettings(env: Env, actor: Actor) {
  const prefs = (await env.DB.prepare('SELECT event, channel, enabled FROM iw_notice_prefs WHERE operator_id=?').bind(actor.id).all<{ event: string; channel: string; enabled: number }>()).results
  const hooks = (await env.DB.prepare('SELECT channel, masked FROM iw_notice_channels WHERE operator_id=?').bind(actor.id).all<{ channel: Hook; masked: string }>()).results
  return {
    canReconcile: actor.role==='owner', events: noticeEvents, channels: noticeChannels,
    choices: Object.fromEntries(noticeEvents.map(event => [event, Object.fromEntries(noticeChannels.map(channel => { const row = prefs.find(p => p.event === event && p.channel === channel); return [channel, row ? row.enabled === 1 : byDefault(event, channel)] }))])),
    connected: Object.fromEntries((Object.keys(hookRules) as Hook[]).map(hook => { const row = hooks.find(h => h.channel === hook); return [hook, row ? row.masked : null] })),
    examples: Object.fromEntries((Object.keys(hookRules) as Hook[]).map(hook => [hook, hookRules[hook].example])),
  }
}

/** Saves `choices` ({event: {channel: on}}), connects a channel with its webhook URL or disconnects it (url null). */
export async function saveNoticeSettings(env: Env, actor: Actor, value: unknown) {
  const input = object(value), writes: D1PreparedStatement[] = []
  if (input.choices !== undefined) for (const [event, channels] of Object.entries(object(input.choices))) {
    insist((noticeEvents as readonly string[]).includes(event), `Choose events among: ${noticeEvents.join(', ')}.`)
    for (const [channel, on] of Object.entries(object(channels))) {
      insist((noticeChannels as readonly string[]).includes(channel) && typeof on === 'boolean', `Turn each of ${noticeChannels.join(', ')} on or off.`)
      writes.push(env.DB.prepare('INSERT INTO iw_notice_prefs(operator_id,event,channel,enabled) VALUES(?,?,?,?) ON CONFLICT(operator_id,event,channel) DO UPDATE SET enabled=excluded.enabled').bind(actor.id, event, channel, on ? 1 : 0))
    }
  }
  if (input.connect !== undefined) {
    const connect = object(input.connect), channel = connect.channel as Hook
    insist(typeof channel === 'string' && Object.hasOwn(hookRules, channel), 'Connect slack, teams or nook.')
    if (connect.url === null) writes.push(env.DB.prepare('DELETE FROM iw_notice_channels WHERE operator_id=? AND channel=?').bind(actor.id, channel))
    else {
      let url: URL | undefined
      try { url = new URL(String(connect.url)) } catch { url = undefined }
      insist(url && url.protocol === 'https:' && !url.username && !url.password && String(connect.url).length <= 600 && hookRules[channel].valid(url), `Paste a ${hookRules[channel].label} incoming webhook URL (${hookRules[channel].example}).`)
      writes.push(env.DB.prepare('INSERT INTO iw_notice_channels(operator_id,channel,sealed,masked,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(operator_id,channel) DO UPDATE SET sealed=excluded.sealed, masked=excluded.masked, updated_at=excluded.updated_at').bind(actor.id, channel, await seal(env, purpose, bound(actor.id, channel), url.href), mask(url), now()))
    }
  }
  insist(writes.length, 'Nothing to save.')
  await env.DB.batch(writes)
  return noticeSettings(env, actor)
}
