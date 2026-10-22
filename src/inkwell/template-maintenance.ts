// AGENT-007: learn from recorded corrections, propose a revision with its sources, and publish only on its maker's command.
import { canonical, insist, now, sha256, text, type Actor, type Env, type Envelope, type Field, type Signer } from './model'
import { envelopeAccess } from './members'
import { readBlob } from './blobs'
import { loadTemplate, templateBytes, updateTemplate, type Role, type Template } from './templates'
import type { CommandContext } from './envelopes'

type Example = { version: number; id: string; title: string; eventHash: string; at: string }
type Definition = Pick<Template, 'fields' | 'roles' | 'originalSha256'>
export type Proposal = { id: string; templateVersion: number; reasons: string[]; changes: { before: Definition; after: Definition }; examples: Example[] }
type Candidate = Proposal & { source: Envelope }
const versionOf = (t: Template) => t.version ?? 1
const roleSettings = (s: Signer, i: number) => ({ order: s.order ?? i + 1, ...(s.accessCode ? { accessCode: true } : {}), ...(s.linkOnly ? { linkOnly: true } : {}), ...(s.includeWhen ? { includeWhen: s.includeWhen } : {}), ...(s.message ? { message: s.message } : {}) })

/** IDs of newly placed fields differ per envelope. Give equal labelled placements equal IDs and remap their references. */
async function stableFields(fields: Field[], baseline: Field[], template: Template) {
  const ids = new Map<string, string>(), occurrences = new Map<string, number>()
  for (const field of fields) {
    if (baseline.some(f => f.id === field.id)) { ids.set(field.id, field.id); continue }
    const key = canonical({ label: field.label, type: field.type, signer: field.signer, page: field.page }), occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    ids.set(field.id, `suggested-${(await sha256(key + occurrence)).slice(0, 24)}`)
  }
  return fields.map(field => {
    const initial = baseline.find(f => f.id === field.id), original = template.fields.find(f => f.id === field.id)
    // Ordinary per-send prefill stays per-send; only an actual recorded correction can change the template.
    if (initial && original && canonical(initial) === canonical(field)) return original
    return { ...field, id: ids.get(field.id)!, ...(field.condition ? { condition: { ...field.condition, field: ids.get(field.condition.field) ?? field.condition.field } } : {}), ...(field.requiredWhen ? { requiredWhen: { ...field.requiredWhen, field: ids.get(field.requiredWhen.field) ?? field.requiredWhen.field } } : {}), ...(field.calculation ? { calculation: { ...field.calculation, fields: field.calculation.fields.map(id => ids.get(id) ?? id) } } : {}) }
  }).sort((a, b) => a.id.localeCompare(b.id))
}

async function candidates(env: Env, actor: Actor, templateId: string) {
  const { template } = await loadTemplate(env, actor, templateId, 'use')
  insist(actor.id === template.createdBy, 'Only the template’s maker can review and publish its suggestions.', 403)
  const rows = (await env.DB.prepare("SELECT e.data FROM iw_envelopes e JOIN iw_events v ON v.envelope_id=e.id AND v.sequence=0 WHERE json_extract(v.data,'$.detail.template.id')=? ORDER BY e.id").bind(template.id).all<{ data: string }>()).results
  const groups = new Map<string, Candidate>()
  const before: Definition = { fields: [...template.fields].sort((a, b) => a.id.localeCompare(b.id)), roles: template.roles, originalSha256: template.originalSha256 }
  for (const row of rows) {
    const envelope = JSON.parse(row.data) as Envelope, prepared = envelope.events[0]
    if (envelope.imported || envelope.templates || (prepared.detail.template as { version?: number })?.version !== versionOf(template) || await envelopeAccess(env, actor, envelope) === 'none') continue
    const correction = envelope.events.findLast(event => ['envelope.updated', 'envelope.corrected', 'signer.corrected', 'signer.added', 'signer.removed'].includes(event.action))
    if (!correction) continue
    const initial = prepared.detail.fields as Field[], initialSigners = prepared.detail.orderedSigners as Signer[]
    const kept = envelope.signers.flatMap((s, i) => s.removedAt ? [] : [i])
    const fields = (await stableFields(envelope.fields, initial, template)).filter(f => kept.includes(f.signer)).map(f => ({ ...f, signer: kept.indexOf(f.signer) }))
    const roles: Role[] = kept.map((place, index) => {
      const signer = envelope.signers[place], original = template.roles[place]
      if (original && initialSigners[place] && canonical(roleSettings(signer, place)) === canonical(roleSettings(initialSigners[place], place))) return original
      return { role: original?.role ?? `Signer ${index + 1}`, ...roleSettings(signer, place) }
    })
    const documentChanged = envelope.originalSha256 !== prepared.detail.originalSha256
    const after: Definition = { fields, roles, originalSha256: documentChanged ? envelope.originalSha256 : template.originalSha256 }
    const reasons: string[] = []
    const oldIds = new Set(before.fields.map(f => f.id)), newIds = new Set(fields.map(f => f.id))
    for (const f of fields) if (!oldIds.has(f.id)) reasons.push(`Add ${f.label} (${f.type}) for ${roles[f.signer]?.role}.`)
    for (const f of before.fields) if (!newIds.has(f.id)) reasons.push(`Remove ${f.label} (${f.type}).`)
    for (const f of fields) if (oldIds.has(f.id) && canonical(f) !== canonical(before.fields.find(old => old.id === f.id))) reasons.push(`Update ${f.label}: placement, properties or prepared value changed.`)
    if (canonical(roles) !== canonical(before.roles)) reasons.push('Update recipient roles or routing; individual names and email addresses are not saved in a template.')
    if (documentChanged) reasons.push('Replace the PDF with the corrected envelope’s original PDF. Review the document: this is a recorded revision, not external verification.')
    if (!reasons.length) continue
    const key = await sha256(canonical({ template: template.id, version: versionOf(template), after }))
    const example = { version: envelope.version, id: envelope.id, title: envelope.title, eventHash: correction.hash, at: correction.at }
    const grouped = groups.get(key)
    if (grouped) grouped.examples.push(example)
    else groups.set(key, { id: key, templateVersion: versionOf(template), reasons, changes: { before, after }, examples: [example], source: envelope })
  }
  // Three independent envelopes establish repetition. A changed source document is itself a revision worth review.
  return { template, proposals: [...groups.values()].filter(p => p.examples.length >= 3 || p.changes.after.originalSha256 !== p.changes.before.originalSha256) }
}

export async function templateProposals(env: Env, actor: Actor, templateId: string) {
  const { proposals } = await candidates(env, actor, templateId)
  return { proposals: proposals.map(({ source: _, ...proposal }) => proposal) }
}

export async function applyTemplateProposal(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const { template, proposals } = await candidates(env, context.actor, text(input.id, 'a template ID'))
  insist(input.version === versionOf(template), 'The template changed. Review its suggestions again.', 409)
  const proposal = proposals.find(p => p.id === text(input.proposalId, 'a suggestion ID', 64))
  insist(proposal, 'This suggestion changed or no longer has its evidence. Review again.', 409)
  const { source, changes, examples } = proposal
  const bytes = changes.after.originalSha256 === template.originalSha256 ? await templateBytes(env, template) : await readBlob(env.DB, source.id, 'original', source.originalSha256)
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return updateTemplate(env, context, {
    id: template.id, title: template.title, filename: changes.after.originalSha256 === template.originalSha256 ? template.filename : source.filename,
    pdfBase64: btoa(binary), fields: changes.after.fields, roles: changes.after.roles, expiryDays: template.expiryDays,
    reminders: template.reminders, allowPaperSigning: Boolean(template.allowPaper), allowReassignment: Boolean(template.allowReassign),
    subject: template.subject, message: template.message, tags: template.tags, approval: template.approval,
  }, { version: versionOf(template), maintenance: { proposalId: proposal.id, by: context.actor.id, at: now(), examples: examples.map(({ id, eventHash }) => ({ id, eventHash })) },
    guards: examples.map(example => ({ sql: 'EXISTS(SELECT 1 FROM iw_events v JOIN iw_envelopes e ON e.id=v.envelope_id WHERE e.id=? AND e.version=? AND v.hash=?)', values: [example.id, example.version, example.eventHash] })) })
}
