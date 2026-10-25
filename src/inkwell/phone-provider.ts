import { insist, Refusal, type Env } from './model'

export interface PhoneBindings {
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_VERIFY_SERVICE_SID?: string
}

const identifier = /^[A-Za-z0-9_-]{1,100}$/
const statuses = ['pending', 'approved', 'canceled', 'max_attempts_reached', 'deleted', 'failed', 'expired']

export function voiceReady(env: Env): boolean {
  const settings = env as Env & PhoneBindings
  return Boolean(settings.TWILIO_ACCOUNT_SID && identifier.test(settings.TWILIO_ACCOUNT_SID)
    && settings.TWILIO_AUTH_TOKEN && settings.TWILIO_VERIFY_SERVICE_SID && identifier.test(settings.TWILIO_VERIFY_SERVICE_SID))
}

/** Fixed Twilio Verify transport; discard every field except the reference, channel and outcome.
 * https://www.twilio.com/docs/verify/api/verification
 * https://www.twilio.com/docs/verify/api/verification-check */
async function verifyRequest(env: Env, resource: 'Verifications' | 'VerificationCheck', body: URLSearchParams) {
  insist(voiceReady(env), 'Phone verification is not configured. Ask the owner to configure Twilio Verify.', 503)
  const settings = env as Env & PhoneBindings
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${settings.TWILIO_VERIFY_SERVICE_SID}/${resource}`, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: {
        Authorization: 'Basic ' + btoa(settings.TWILIO_ACCOUNT_SID + ':' + settings.TWILIO_AUTH_TOKEN),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (resource === 'VerificationCheck' && response.status === 404) {
      await response.body?.cancel()
      return null
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Refusal(response.status === 429 ? 'Too many phone verification requests. Wait before trying again.'
        : 'Phone verification could not be confirmed. Contact the sender before requesting another call.', response.status === 429 ? 429 : 503)
    }
    const reader = response.body?.getReader()
    insist(reader, 'The phone provider returned no verification result.', 503)
    const chunks: Uint8Array[] = []; let size = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16 * 1024) {
          await reader.cancel()
          throw new Refusal('The phone provider returned an invalid verification result.', 503)
        }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes))
    insist(result !== null && typeof result === 'object' && !Array.isArray(result), 'The phone provider returned an invalid verification result.', 503)
    const { sid, channel, status } = result as Record<string, unknown>
    insist(typeof sid === 'string' && identifier.test(sid) && channel === 'call'
      && typeof status === 'string' && statuses.includes(status), 'The phone provider returned an invalid verification result.', 503)
    return { reference: sid, status }
  } catch (error) {
    if (error instanceof Refusal) throw error
    throw new Refusal('Phone verification could not be confirmed. Contact the sender before requesting another call.', 503)
  } finally { clearTimeout(timeout) }
}

/** A caller must durably claim a send before this call. Twilio documents no idempotency parameter here;
 * an uncertain request is never automatically repeated by this adapter. */
export async function requestVoice(env: Env, phone: string): Promise<{ reference: string }> {
  insist(typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone), 'Enter a phone number with its country code.')
  const result = await verifyRequest(env, 'Verifications', new URLSearchParams({ To: phone, Channel: 'call' }))
  insist(result?.status === 'pending', 'The phone provider did not start a verification call.', 503)
  return { reference: result.reference }
}

/** Only provider approval admits the recipient. A deleted or expired provider reference cannot admit them. */
export async function checkVoice(env: Env, reference: string, code: string): Promise<boolean> {
  insist(typeof reference === 'string' && identifier.test(reference), 'Request a new phone verification call.', 401)
  insist(typeof code === 'string' && /^\d{4,10}$/.test(code), 'Enter the code from your verification call.')
  const result = await verifyRequest(env, 'VerificationCheck', new URLSearchParams({ VerificationSid: reference, Code: code }))
  insist(!result || result.reference === reference, 'The phone provider returned a different verification reference.', 503)
  return result?.status === 'approved'
}
