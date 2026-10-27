import { appendEvent, insist, now, text, id, type Env, type Envelope, type Actor } from './model'
import { atomic, commandWrite, roleGuard, getEnvelope } from './storage'
import { loadTemplate } from './templates'
import { readBlob } from './blobs'
import { fileArtifact, type FilingProvider } from './filing-provider'
import type { CommandContext } from './envelopes'

export const filingConsent = 'I authorize automatic transfer of completed PDFs and certificates from this template to the selected provider folder.'
interface Rule { template_id: string; provider: FilingProvider; folder: string; enabled: number; version: number; actor: string; at: string }
interface Job { envelope_id: string; provider: FilingProvider; folder: string; kind: 'signed' | 'certificate'; sha256: string; state: string; remote_id: string | null; filed_at: string | null }
const credential = (env: Env, provider: FilingProvider) => provider === 'box' ? env.BOX_ACCESS_TOKEN : env.DROPBOX_ACCESS_TOKEN
function administrator(actor: Actor) { insist(['owner','admin'].includes(actor.role) && actor.sessionId && !actor.apiKeyId && !actor.agentId, 'Only a signed-in owner or admin can manage automatic filing.', 403) }
export async function filingView(env: Env, actor: Actor) {
 administrator(actor)
 const rules = (await env.DB.prepare('SELECT * FROM iw_filing_rules ORDER BY template_id,provider').all<Rule>()).results
 const jobs = (await env.DB.prepare('SELECT j.*,json_extract(e.data,\'$.title\') AS title FROM iw_filing_jobs j JOIN iw_envelopes e ON e.id=j.envelope_id ORDER BY j.rowid DESC LIMIT 40').all<Job & {title:string}>()).results
 return { providers: { box: Boolean(env.BOX_ACCESS_TOKEN), dropbox: Boolean(env.DROPBOX_ACCESS_TOKEN) }, rules, jobs, consent: filingConsent }
}
export async function saveFiling(env: Env, context: CommandContext, input: Record<string,unknown>) {
 administrator(context.actor)
 const templateId = text(input.templateId,'a template ID',100), provider = input.provider
 insist(provider === 'box' || provider === 'dropbox', 'Choose Box or Dropbox.')
 await loadTemplate(env,context.actor,templateId,'manage')
 insist(typeof input.enabled === 'boolean', 'Choose whether automatic filing is enabled.')
 insist(!input.enabled || input.consent === true, 'Explicitly authorize automatic transfer before enabling filing.')
 insist(!input.enabled || credential(env,provider), 'Configure the provider credential in this installation first.', 409)
 const folder = typeof input.folder === 'string' ? input.folder.trim() : ''
 insist(folder.length <= 1000 && !/[\\\x00-\x1f\x7f]/.test(folder), 'Provide a valid provider folder.')
 insist(provider === 'box' ? /^\d+$/.test(folder) : folder === '' || folder.startsWith('/') && !folder.endsWith('/') && !folder.includes('//') && !folder.split('/').some(p=>p==='.'||p==='..'), 'Use a Box folder ID or an absolute Dropbox folder path.')
 const before = await env.DB.prepare('SELECT * FROM iw_filing_rules WHERE template_id=? AND provider=?').bind(templateId,provider).first<Rule>()
 insist(input.expectedVersion === (before?.version ?? 0), 'Filing settings changed. Refresh and try again.',409)
 const rule: Rule = { template_id:templateId, provider, folder, enabled:input.enabled ? 1 : 0, version:(before?.version??0)+1, actor:context.actor.id, at:now() }
 const result = { rule }
 await atomic(env.DB,[roleGuard(context.actor,['owner','admin']),{sql:'COALESCE((SELECT version FROM iw_filing_rules WHERE template_id=? AND provider=?),0)=?',values:[templateId,provider,before?.version??0]}],[
  env.DB.prepare('INSERT INTO iw_filing_rules VALUES(?,?,?,?,?,?,?) ON CONFLICT(template_id,provider) DO UPDATE SET folder=excluded.folder,enabled=excluded.enabled,version=excluded.version,actor=excluded.actor,at=excluded.at').bind(templateId,provider,folder,rule.enabled,rule.version,rule.actor,rule.at),
  env.DB.prepare('INSERT INTO iw_filing_history VALUES(?,?,?,?,?,?,?,?)').bind(id(),templateId,provider,rule.actor,rule.at,input.enabled?filingConsent:'Automatic filing disabled',before?JSON.stringify(before):null,JSON.stringify(rule)),
  commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)
 ])
 return result
}
/** Completion and durable per-artifact jobs commit together. Restored records never create jobs. */
export async function filingWrites(env: Env, envelope: Envelope) {
 if(envelope.testMode)return []
 const templates = envelope.templates ?? (envelope.template ? [envelope.template] : [])
 const writes: D1PreparedStatement[] = [], destinations = new Set<string>()
 for (const template of templates) {
  const rules = (await env.DB.prepare('SELECT * FROM iw_filing_rules WHERE template_id=? AND enabled=1').bind(template.id).all<Rule>()).results
  for (const rule of rules) {
   const key = JSON.stringify([rule.provider,rule.folder]); if (destinations.has(key)) continue; destinations.add(key)
   await appendEvent(envelope,'filing.authorized','inkwell',{provider:rule.provider,folder:rule.folder,template:template.id,version:rule.version,authorizedBy:rule.actor,authorizedAt:rule.at})
   for (const kind of ['signed','certificate'] as const) writes.push(env.DB.prepare('INSERT INTO iw_filing_jobs(envelope_id,provider,folder,kind,sha256) VALUES(?,?,?,?,?)').bind(envelope.id,rule.provider,rule.folder,kind,kind==='signed'?envelope.signedSha256!:envelope.certificateSha256!))
  }
 }
 return writes
}
/** A failed attempt remains visible. Only an explicit retry reclaims uncertain work. */
export async function dispatchFiling(env: Env, envelopeId: string, retry = false) {
 const envelope = await getEnvelope(env.DB,envelopeId)
 if (envelope.testMode || envelope.status !== 'completed' || envelope.imported) return
 const jobs = (await env.DB.prepare("SELECT * FROM iw_filing_jobs WHERE envelope_id=? AND (state='pending' OR (?=1 AND (state='uncertain' OR state='sending' AND started_at<?)))").bind(envelopeId,retry?1:0,Date.now()-120_000).all<Job>()).results
 for (const job of jobs) {
  const allowed = await env.DB.prepare("SELECT 1 FROM iw_filing_rules WHERE provider=? AND folder=? AND enabled=1 AND template_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(job.provider,job.folder,JSON.stringify(envelope.templates??(envelope.template?[envelope.template]:[]))).first()
  if (!allowed) { await env.DB.prepare("UPDATE iw_filing_jobs SET state='cancelled' WHERE envelope_id=? AND provider=? AND folder=? AND kind=? AND state<>'filed'").bind(envelopeId,job.provider,job.folder,job.kind).run(); continue }

  const claim = id(), token = credential(env,job.provider)
  const claimed = await env.DB.prepare("UPDATE iw_filing_jobs SET state='sending',claim=?,started_at=? WHERE envelope_id=? AND provider=? AND folder=? AND kind=? AND (state='pending' OR (?=1 AND (state='uncertain' OR state='sending' AND started_at<?))) RETURNING kind").bind(claim,Date.now(),envelopeId,job.provider,job.folder,job.kind,retry?1:0,Date.now()-120_000).first()
  if (!claimed) continue
  try {
   insist(token,'Provider credential is unavailable.',409)
   const bytes = await readBlob(env.DB,envelopeId,job.kind,job.sha256)
   const receipt = await fileArtifact(job.provider,token,job.folder,`inkwell-${envelopeId}-${job.kind}.pdf`,bytes)
   await env.DB.prepare("UPDATE iw_filing_jobs SET state='filed',remote_id=?,filed_at=?,claim=NULL WHERE envelope_id=? AND provider=? AND folder=? AND kind=? AND claim=?").bind(receipt.id,now(),envelopeId,job.provider,job.folder,job.kind,claim).run()
  } catch {
   await env.DB.prepare("UPDATE iw_filing_jobs SET state='uncertain',claim=NULL WHERE envelope_id=? AND provider=? AND folder=? AND kind=? AND claim=?").bind(envelopeId,job.provider,job.folder,job.kind,claim).run()
  }
 }
}
export async function retryFiling(env: Env, actor: Actor, input: Record<string,unknown>) {
 administrator(actor)
 await dispatchFiling(env,text(input.id,'an envelope ID',100),true)
 return { ok:true }
}

export async function dispatchPendingFiling(env: Env) {
 const rows=(await env.DB.prepare("SELECT DISTINCT envelope_id FROM iw_filing_jobs WHERE state='pending' LIMIT 40").all<{envelope_id:string}>()).results
 for(const row of rows)await dispatchFiling(env,row.envelope_id)
}
