import { createPortability, readArchive, PortabilityError, type Manifest, type Part, type Closing } from '@runeditrun/rer/modules/portability'
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server'
import policy from './archive-policy.mjs'
import { insist, Refusal, type Actor } from './model'
import { getEnvelope, atomic, roleGuard, guardStatements } from './storage'

type Archive = { format: 'inkwell-archive'; ndjson: string }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
async function owner(request: Request, env: Bindings): Promise<Actor> {
 const session = await operatorAuth(env).getSession(request)
 insist(session, 'Sign in to manage the archive.', 401)
 insist(session.operator.role === 'owner', 'Only the owner can manage archives or erase documents.', 403)
 if (request.method !== 'GET') insist(request.headers.get('origin') === env.AUTH_ORIGIN, 'The request origin was refused.', 403)
 return { id: session.operator.id, name: session.operator.displayName, email: session.operator.email, role: 'owner', version: session.operator.version, sessionId: session.id }
}
function guardedDatabase(db: D1Database, actor: Actor): D1Database {
 return { prepare: db.prepare.bind(db), async batch(statements: D1PreparedStatement[]) {
  const guards = guardStatements(db,[roleGuard(actor,['owner'])]);
  const result = await db.batch([guards.check,...statements,guards.clear]);
  return result.slice(1,-1);
 } } as D1Database
}
async function body(request: Request): Promise<Record<string, unknown>> {
 const reader = request.body?.getReader(); insist(reader, 'Provide the archive.')
 const chunks: Uint8Array[] = []; let size = 0
 try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; insist(size <= 24 * 1024 * 1024, 'Browser transfers are limited to 24 MiB; use rer export/import for larger archives.', 413); chunks.push(value) } } finally { await reader.cancel(); reader.releaseLock() }
 const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c,offset); offset += c.length }
 try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Refusal('Provide a valid JSON archive.') }
}
async function records(value: unknown) {
 const archive = value as Archive
 insist(archive?.format === 'inkwell-archive' && typeof archive.ndjson === 'string', 'Choose an Inkwell archive JSON file.')
 const result: (Manifest | Part | Closing)[] = []
 for await (const record of readArchive(new Response(archive.ndjson).body!)) result.push(record)
 return result
}
async function restore(env: Bindings, actor: Actor, input: Record<string, unknown>) {
 // Validate the complete checksum-bound stream before creating any import job.
 const all = await records(input.archive), manifest = all[0] as Manifest, closing = all.at(-1) as Closing
 const later = input.laterJournal ? (await records(input.laterJournal))[0] as Manifest : undefined
 const service = await createPortability({ db: guardedDatabase(env.DB,actor), policy })
 let job: string | undefined, complete = false
 try {
  job = await service.imports.create(manifest, actor.id)
  for (const record of all) if (record.kind === 'part') await service.imports.uploadPart(job,record.index,record)
  // The native owner must still have authority after potentially lengthy uploads.
  const allowed = roleGuard(actor, ['owner'])
  insist(await env.DB.prepare(`SELECT 1 WHERE ${allowed.sql}`).bind(...allowed.values).first(), 'Owner authority changed. Sign in again.', 403)
  await service.imports.finalize(job,{ contentHash: closing.contentHash, archiveHash: closing.archiveHash, ...(later ? { laterJournal: { sourceIdentity: later.sourceIdentity, epoch: later.epoch, journal: later.journal } } : {}) })
  complete = true
  return json({ ok: true })
 } finally { if (job && !complete) await service.imports.abort(job) }
}
async function erase(env: Bindings, actor: Actor, input: Record<string, unknown>) {
 insist(input.confirmation === 'ERASE' && typeof input.id === 'string', 'Type ERASE to confirm permanent deletion.')
 const before = await getEnvelope(env.DB,input.id)
 insist(before.status !== 'awaiting_signature', 'Void an active envelope before erasing it.', 409)
 const service = await createPortability({ db: guardedDatabase(env.DB,actor), policy })
 const deleted = ['iw_blobs','iw_events','iw_signers','iw_mail','iw_access_codes','iw_copy_links','iw_shares'].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE envelope_id=?`).bind(before.id))
 await atomic(env.DB,[roleGuard(actor,['owner']),{sql:'EXISTS(SELECT 1 FROM iw_envelopes WHERE id=? AND version=?)',values:[before.id,before.version]}],[
  ...await service.redactionStatements(), ...await service.erasureStatements('iw_envelopes',{id:before.id}), ...await service.invalidateTransfersStatements(),
  env.DB.prepare("DELETE FROM rer_mail_development_outbox WHERE json_extract(message,'$.deliveryId') IN (SELECT id FROM iw_mail WHERE envelope_id=?)").bind(before.id),
  ...deleted, env.DB.prepare('DELETE FROM iw_envelopes WHERE id=?').bind(before.id),
  // Command results and local mail can retain identity/link fragments. Delete
  // this envelope's command results and messages, never another document's rows.
  env.DB.prepare("DELETE FROM iw_commands WHERE json_extract(result,'$.id')=?").bind(before.id),
 ])
 return json({ ok: true })
}
export async function archiveResponse(request: Request, original: Bindings): Promise<Response | null> {
 const path = new URL(request.url).pathname
 if (!['/api/inkwell/archive','/api/inkwell/archive/restore','/api/inkwell/erase'].includes(path)) return null
 const env = runtimeBindings(original)
 try {
  const actor = await owner(request,env)
  if (path === '/api/inkwell/archive' && request.method === 'GET') {
   const service = await createPortability({db:guardedDatabase(env.DB,actor),policy}), job = await service.exports.create(actor.id)
   try {
    while ((await service.exports.advance(job,{maxParts:16})).phase === 'building') {}
    const ndjson = await new Response(await service.exports.download(job)).text()
    return new Response(JSON.stringify({format:'inkwell-archive',ndjson}),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="inkwell-archive.json"','cache-control':'no-store'}})
   } finally { await service.exports.abort(job) }
  }
  if (path === '/api/inkwell/archive/restore' && request.method === 'POST') return await restore(env,actor,await body(request))
  if (path === '/api/inkwell/erase' && request.method === 'POST') return await erase(env,actor,await body(request))
  return json({error:'Method not allowed.'},405)
 } catch (e) {
  if (e instanceof PortabilityError) return json({error:`Archive refused: ${e.code}. Restore needs an empty document store and a complete, unchanged archive.`},e.status)
  if (e instanceof Refusal) return json({error:e.message},e.status)
  console.error('Archive operation failed', e instanceof Error ? e.name : 'Error')
  return json({error:'Archive operation failed. No success was recorded.'},500)
 }
}
