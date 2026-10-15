import { Buffer } from 'node:buffer'
import type { Bindings } from '../auth.server'
import { readArchive, NAMESPACE, MAPPING } from '../inkwell/imports/source'
import { archiveTargets } from '../inkwell/imports/targets'
import { planD1Import, createD1ImportJob, resumeD1Import, type D1ImportContext } from '../modules/import-kit/src/d1/index'
import { agreementPdf } from './documents'
import { emailFor } from './records'

/** Uses Inkwell's existing DocuSeal archive reader and journal, retaining actual PDF bytes. */
export async function seedImported(env: Bindings, now: Date, ownerId: string) {
  const context: D1ImportContext = { destination: 'inkwell', namespace: NAMESPACE, mappingVersion: MAPPING, operationKey: 'demo-docuseal-archive', batchSize: 4, maxBatches: 10, storage: { database: env.DB, targets: archiveTargets }, authorization: { principalId: 'role:owner', predicate: () => ({ sql: "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')", params: [ownerId] }) } }
  const existing = await env.DB.prepare('SELECT id FROM ik_jobs WHERE destination=? AND operation_key=?').bind('inkwell', 'demo-docuseal-archive').first<{ id: string }>()
  if (existing) {
    const result = await resumeD1Import(existing.id, context)
    if (result.state !== 'completed') throw new Error('Demo archive import did not complete')
    return
  }
  const titles = ['Maple Studio - Annual retainer', 'Harbour Coffee - Original lease', 'Willow Clinic - Records policy', 'Cedar House - Initial brief']
  const names = ['Maya Chen', 'Oliver Grant']
  const submissions = [], files = []
  for (const [index, title] of titles.entries()) {
    const completedAt = new Date(now.getTime() - (45 + index * 7) * 86400000).toISOString()
    const url = `https://archive.example.com/agreements/${index + 1}`
    const signed = await agreementPdf(title, names, completedAt)
    const audit = await agreementPdf('DocuSeal - Completion record', names, completedAt)
    submissions.push({ id: 1001 + index, name: title, status: 'completed', completed_at: completedAt, audit_log_url: url + '/audit.pdf', documents: [{ url: url + '/signed.pdf' }], submitters: names.map((name, signer) => ({ name, email: emailFor(name), role: signer ? 'Client' : 'Supplier', status: 'completed', completed_at: completedAt })) })
    files.push({ url: url + '/signed.pdf', name: `agreement-${1001 + index}.pdf`, base64: Buffer.from(signed).toString('base64') }, { url: url + '/audit.pdf', name: `audit-${1001 + index}.pdf`, base64: Buffer.from(audit).toString('base64') })
  }
  const { source, mapping } = await readArchive({ provider: 'docuseal', account: 'Cedar House archive', submissions, files })
  const plan = await planD1Import(source, mapping, context)
  const job = await createD1ImportJob(plan, { ...context, reviewedFingerprint: plan.fingerprint })
  const result = await resumeD1Import(job.id, context)
  if (result.state !== 'completed') throw new Error('Demo archive import did not complete')
}
