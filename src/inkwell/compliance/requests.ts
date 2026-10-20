import { operatorAuth, runtimeBindings, type Bindings } from '../../auth.server'
import { now } from '../model'
import { healthcareProfile } from './profile'

/** COMPLY-002: fixed categories only. Never log URLs, queries, bodies, headers, errors or response contents. */
const door = (request: Request) => {
  const path = new URL(request.url).pathname
  return path.startsWith('/api/sign/') || path.startsWith('/sign/') ? 'signing'
    : path.startsWith('/api/copy/') || path.startsWith('/copy/') ? 'completed-copy'
    : path.startsWith('/auth/') || path === '/signin' ? 'authentication'
    : path.startsWith('/api/inkwell/mail/') ? 'provider-event'
    : path.startsWith('/api/') ? 'workspace-api' : 'page'
}

/** Wrap the whole installation dispatcher, including auth, import, archive and document doors.
 * A valid member session on a response below 400 counts. A freshly issued member session counts too.
 * Anonymous recipients and agent bearer tokens never count as a workspace member's access. */
export async function complianceRequest(request: Request, original: Bindings, handle: () => Promise<Response>): Promise<Response> {
  const env = runtimeBindings(original), auth = operatorAuth(env)
  const session = await auth.getSession(request)
  const enabled = await healthcareProfile(env)
  let response: Response
  try { response = await handle() }
  catch { response = Response.json({ error: 'The request could not be completed. Please try again.' }, { status: 500, headers: { 'cache-control': 'no-store' } }) }
  if (response.status < 400) {
    const cookies = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
    const headers = new Headers(request.headers)
    if (cookies) headers.set('cookie', cookies)
    const member = session ?? (cookies ? await auth.getSession(new Request(request.url, { headers })) : null)
    if (member) await env.DB.prepare(`INSERT INTO iw_member_access(operator_id,last_access_at) VALUES(?,?)
      ON CONFLICT(operator_id) DO UPDATE SET last_access_at=MAX(iw_member_access.last_access_at,excluded.last_access_at)`).bind(member.operator.id, now()).run()
  }
  if (enabled) console.info(JSON.stringify({ event: 'inkwell.request', door: door(request), status: response.status }))
  return response
}
