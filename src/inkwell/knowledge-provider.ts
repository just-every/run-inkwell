import { insist, Refusal, type Env } from './model'

export interface KnowledgeBindings {
  AUTHENTICATE_API_KEY?: string
  AUTHENTICATE_KBA_WORKFLOW_ID?: string
}

const opaque = /^[A-Za-z0-9_-]{1,128}$/
const invalidResult = 'The identity provider returned an invalid verification result.'

export function knowledgeReady(env: Env): boolean {
  const settings = env as Env & KnowledgeBindings
  return Boolean(settings.AUTHENTICATE_API_KEY && settings.AUTHENTICATE_API_KEY.trim()
    && settings.AUTHENTICATE_KBA_WORKFLOW_ID && opaque.test(settings.AUTHENTICATE_KBA_WORKFLOW_ID))
}

function object(value: unknown): Record<string, unknown> {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value), invalidResult, 503)
  return value as Record<string, unknown>
}

function reference(value: unknown): string {
  insist(typeof value === 'string' && opaque.test(value), invalidResult, 503)
  return value
}

/** Requests never follow redirects, expose provider errors or retain the potentially sensitive response.
 * The caller must durably claim creation before invoking this adapter; no automatic retry is performed. */
async function providerRequest(env: Env, path: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
  insist(knowledgeReady(env), 'Knowledge verification is not configured. Ask the owner to configure Authenticate.', 503)
  const settings = env as Env & KnowledgeBindings
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('https://api-v3.authenticating.com' + path, {
      method: body ? 'POST' : 'GET', redirect: 'manual', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + settings.AUTHENTICATE_API_KEY, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Refusal(response.status === 429 ? 'Too many identity verification requests. Wait before trying again.'
        : 'Identity verification could not be confirmed. Contact the sender before trying again.', response.status === 429 ? 429 : 503)
    }
    const reader = response.body?.getReader()
    insist(reader, invalidResult, 503)
    const chunks: Uint8Array[] = []; let size = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16 * 1024) { await reader.cancel(); throw new Refusal(invalidResult, 503) }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return object(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error) {
    if (error instanceof Refusal) throw error
    throw new Refusal('Identity verification could not be confirmed. Contact the sender before trying again.', 503)
  } finally { clearTimeout(timeout) }
}

/** https://docs.authenticate.com/reference/get_user-medallion-medallion-verification-token-status
 * Pin the returned applicant, actual workflow and session; a provider default workflow cannot admit a signer. */
async function knowledgeStatus(env: Env, token: string, applicantReference: string, expectedSession?: string) {
  reference(token); reference(applicantReference)
  const result = await providerRequest(env, '/user/medallion/' + token + '/status')
  insist(result.userAccessCode === applicantReference, 'The identity verification belongs to a different applicant.', 503)
  const current = object(object(result.medallion).currentSession), session = reference(current.uuid)
  insist(expectedSession === undefined || session === expectedSession, 'The identity verification session changed. Contact the sender.', 409)
  insist(current.workflowId === (env as Env & KnowledgeBindings).AUTHENTICATE_KBA_WORKFLOW_ID,
    'The identity provider used a different workflow. Ask the owner to check the knowledge verification configuration.', 503)
  insist(['INITIALIZED', 'IN_PROGRESS', 'COMPLETED'].includes(String(current.status)), invalidResult, 503)
  const expires = typeof current.expireOn === 'string' ? Date.parse(current.expireOn) : NaN
  insist(Number.isFinite(expires), invalidResult, 503)
  insist(expires > Date.now(), 'This identity verification session expired. Request a new verification.', 401)
  const kba = object(current.kba), attempts = object(kba.attempts)
  insist(kba.mandatory === true, 'The identity provider must require knowledge verification.', 503)
  for (const method of ['govtId', 'bank']) {
    insist(current[method] == null || object(current[method]).mandatory === false,
      'The identity provider must use the configured knowledge verification workflow.', 503)
  }
  insist(typeof attempts.allowed === 'number' && Number.isInteger(attempts.allowed) && attempts.allowed >= 1 && attempts.allowed <= 2,
    'The knowledge verification workflow must allow at most two attempts.', 503)
  insist(typeof attempts.availed === 'number' && Number.isInteger(attempts.availed) && attempts.availed >= 0 && attempts.availed <= attempts.allowed,
    invalidResult, 503)
  insist((kba.status === 'PENDING' || kba.status === 'COMPLETED') && typeof kba.success === 'boolean', invalidResult, 503)
  return { session, status: kba.status, success: kba.success, attempts: attempts.availed }
}

function applicantBody(applicant: { name: string; email: string; dob: string }): Record<string, string> {
  insist(typeof applicant.name === 'string' && applicant.name.length <= 200 && !/[\x00-\x1f\x7f]/.test(applicant.name), 'Enter your full legal name.')
  const parts = applicant.name.trim().split(/\s+/)
  insist(parts.length >= 2 && parts.every(Boolean), 'Enter your first and last legal names.')
  insist(typeof applicant.email === 'string' && applicant.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.email), 'Enter a valid email address.')
  insist(typeof applicant.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(applicant.dob), 'Enter your date of birth.')
  const date = new Date(applicant.dob + 'T00:00:00.000Z')
  insist(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === applicant.dob
    && Number(applicant.dob.slice(0, 4)) > 0 && date.getTime() <= Date.now(), 'Enter a valid date of birth.')
  const [year, month, day] = applicant.dob.split('-')
  return { firstName: parts[0], lastName: parts.slice(1).join(' '), email: applicant.email, dob: `${day}-${month}-${year}` }
}

/** https://docs.authenticate.com/reference/post_user-create
 * https://docs.authenticate.com/reference/post_user-jwt
 * Hosted Medallion collects consent, questions and answers. No signing link is sent to the provider. */
export async function startKnowledge(env: Env, applicant: { name: string; email: string; dob: string }, previousReference?: string):
Promise<{ reference: string; session: string; token: string; url: string }> {
  const applicantReference = previousReference === undefined
    ? reference((await providerRequest(env, '/user/create', applicantBody(applicant))).userAccessCode)
    : reference(previousReference)
  const result = await providerRequest(env, '/user/jwt', {
    userAccessCode: applicantReference, preferredWorkflowID: (env as Env & KnowledgeBindings).AUTHENTICATE_KBA_WORKFLOW_ID!,
  })
  const token = reference(result.token), status = await knowledgeStatus(env, token, applicantReference)
  return { reference: applicantReference, session: status.session, token, url: 'https://verify.authenticating.com/?token=' + token }
}

export async function checkKnowledge(env: Env, token: string, applicantReference: string, session: string):
Promise<{ outcome: 'pending' | 'passed' | 'failed'; failedAttempts: number }> {
  reference(session)
  const status = await knowledgeStatus(env, token, applicantReference, session)
  if (status.status === 'PENDING') return { outcome: 'pending', failedAttempts: 0 }
  insist(status.attempts >= 1, invalidResult, 503)
  if (status.success) return { outcome: 'passed', failedAttempts: 0 }
  return { outcome: 'failed', failedAttempts: status.attempts }
}
