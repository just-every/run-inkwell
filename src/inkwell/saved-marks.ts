import { now, type Adoption, type Envelope, type Env } from './model'

/** ROUTE-009: a member who signs with their Inkwell session (MANAGE-003) adopts a signature once; it is saved to them
 * and offered for their later in-app signing, and signing with a different one replaces it. SIGNX-002: the saved
 * signature keeps how it was adopted, with a drawn or uploaded image itself. Initials join when PREP-003 adds them. */
const authActions = ['signer.email_verified', 'signer.code_verified', 'signer.session_verified', 'signer.link_opened']
/** The member whose session last authenticated this signer, if their latest authentication was a session. */
export function sessionMember(envelope: Envelope, signer: number) {
  const last = envelope.events.filter(e => authActions.includes(e.action) && e.detail.signer === signer).at(-1)
  return last?.action === 'signer.session_verified' ? last.detail.operator as string : undefined
}
export type SavedMark = { signature: string; adoption: Adoption; imageBase64?: string }
export async function savedSignature(env: Env, operator?: string): Promise<SavedMark | undefined> {
  const row = operator ? await env.DB.prepare('SELECT signature,mark FROM iw_member_marks WHERE operator_id=?').bind(operator).first<{ signature: string; mark: string | null }>() : null
  if (!row) return undefined
  const mark = row.mark ? JSON.parse(row.mark) as { adoption: Adoption; imageBase64?: string } : { adoption: { method: 'typed', style: 'sans' } as Adoption }
  return { signature: row.signature, ...mark }
}
export function saveSignatureWrite(env: Env, operator: string, signature: string, adoption: Adoption, image?: Uint8Array) {
  const mark = JSON.stringify({ adoption, ...(image ? { imageBase64: btoa(Array.from(image, b => String.fromCharCode(b)).join('')) } : {}) })
  return env.DB.prepare('INSERT INTO iw_member_marks(operator_id,signature,mark,updated_at) VALUES(?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET signature=excluded.signature,mark=excluded.mark,updated_at=excluded.updated_at').bind(operator, signature, mark, now())
}
