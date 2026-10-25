import { id, now, type Env, type Envelope } from './model'
import { noticeWrite } from './mail'
import { mailSuppressed } from './manual-invitations'

/** Mandatory lock notice, once in the same transaction as locking, with no provider payload. */
export async function providerLockWrites(env: Env, envelope: Envelope, signer: number): Promise<D1PreparedStatement[]> {
  const sender = await env.DB.prepare('SELECT email FROM oa_operators WHERE id=?').bind(envelope.createdBy).first<{email:string}>()
  const line = `${envelope.signers[signer].name}'s invitation is locked after failed verification. Correct the recipient to issue a new invitation.`
  return [env.DB.prepare('INSERT INTO iw_notices(id,operator_id,envelope_id,event,at,title,recipient) VALUES(?,?,?,?,?,?,?)').bind(id(),envelope.createdBy,envelope.id,'identity_locked',now(),envelope.title,line),
    ...(sender && !mailSuppressed(env) ? [noticeWrite(env.DB,envelope,signer,sender.email,`Verification locked: ${envelope.title}`,line)] : [])]
}
