import { now, type Envelope, type Env } from './model'

/** ROUTE-009: a member who signs with their Inkwell session (MANAGE-003) adopts a signature once; it is saved to them
 * and offered for their later in-app signing, and signing with a different one replaces it. Initials join when
 * SIGNX-002 and PREP-003 add them. */
const authActions = ['signer.email_verified', 'signer.code_verified', 'signer.session_verified']
/** The member whose session last authenticated this signer, if their latest authentication was a session. */
export function sessionMember(envelope: Envelope, signer: number) {
  const last = envelope.events.filter(e => authActions.includes(e.action) && e.detail.signer === signer).at(-1)
  return last?.action === 'signer.session_verified' ? last.detail.operator as string : undefined
}
export async function savedSignature(env: Env, operator?: string) {
  return operator ? (await env.DB.prepare('SELECT signature FROM iw_member_marks WHERE operator_id=?').bind(operator).first<{ signature: string }>())?.signature : undefined
}
export function saveSignatureWrite(env: Env, operator: string, signature: string) {
  return env.DB.prepare('INSERT INTO iw_member_marks(operator_id,signature,updated_at) VALUES(?,?,?) ON CONFLICT(operator_id) DO UPDATE SET signature=excluded.signature,updated_at=excluded.updated_at').bind(operator, signature, now())
}
