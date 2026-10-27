import { customEnvelopeFields, mergeCustomFields } from './envelope-metadata'
import { composition, type CompositionChoices } from './template-composition'
import { loadTemplate, templateBytes } from './templates'
import { templateOriginal } from './template-documents'
import { supplementsFromTemplate } from './template-supplements'
import { visibleSql } from './template-shares'
import { accessCodeWrites, draftDetail, readDraft } from './drafts'
import { consumedUploadWrites, documentWrites, readDocuments, stagedBlobWrites, type EnvelopeDocument } from './documents'
import { blobWrites, readBlob } from './blobs'
import { commandWrite, insertEnvelope, type Guard } from './storage'
import { appendEvent, id, insist, now, object, text, type Actor, type Envelope, type Env } from './model'
import type { CommandContext } from './envelopes'

function choicesOf(value: unknown): CompositionChoices {
  if (value === undefined) return {}
  const raw = object(value)
  insist(Object.keys(raw).every(key => key === 'settingsTemplate' || key === 'identity' || key === 'orders'), 'Choose only envelope settings and role authentication.')
  const identity = raw.identity === undefined ? undefined : object(raw.identity)
  if (identity) insist(Object.values(identity).every(method => ['email', 'link', 'sms', 'identity', 'knowledge', 'voice'].includes(String(method))), 'Choose an authentication method.')
  const orders = raw.orders === undefined ? undefined : object(raw.orders)
  if(orders)insist(Object.values(orders).every(order=>order===null||Number.isSafeInteger(order)), 'Choose an existing whole-number routing order or keep separate recipients.')
  return { ...(orders?{orders:orders as Record<string,number|null>}:{}), ...(raw.settingsTemplate === undefined ? {} : { settingsTemplate: text(raw.settingsTemplate, 'a settings template ID') }), ...(identity ? { identity: identity as NonNullable<CompositionChoices['identity']> } : {}) }
}
async function sourcesOf(env: Env, actor: Actor, input: Record<string, unknown>) {
  insist(['owner', 'admin', 'sender'].includes(actor.role), 'Your role does not allow template composition.', 403)
  insist(Array.isArray(input.ids) && input.ids.length >= 2 && input.ids.length <= 20, 'Choose 2–20 templates in document order.')
  const ids = input.ids.map(value => text(value, 'a template ID'))
  insist(new Set(ids).size === ids.length, 'Choose each template once.')
  return Promise.all(ids.map(value => loadTemplate(env, actor, value, 'use')))
}
/** Re-evaluate source use access inside the final write batch, alongside exact serialized definitions and row custody. */
function sourceGuard(actor: Actor, source: Awaited<ReturnType<typeof loadTemplate>>): Guard {
  const accessible = visibleSql(actor), count = accessible.sql.match(/\?1/g)?.length ?? 0
  return { sql: `EXISTS(SELECT 1 FROM iw_templates t WHERE t.id=? AND t.data=? AND t.created_by=? AND t.folder_id IS ? AND ${accessible.sql.replaceAll('?1', '?')})`,
    values: [source.row.id, source.row.data, source.row.created_by, source.row.folder_id, ...(count ? Array.from({ length: count }, () => actor.id) : accessible.values)] }
}
export async function previewComposition(env: Env, actor: Actor, input: Record<string, unknown>) {
  const sources = await sourcesOf(env, actor, input)
  return composition(sources.map(source => source.template), choicesOf(input.choices))
}

/** Prepare one immutable combined draft; every byte and source definition is pinned before the envelope is inserted. */
export async function combineTemplates(env: Env, context: CommandContext, input: Record<string, unknown>) {
  const sources = await sourcesOf(env, context.actor, input), choices = choicesOf(input.choices)
  const plan = composition(sources.map(source => source.template), choices)
  insist(plan.roles.every(r=>!r.needsIdentityChoice), 'Choose authentication explicitly for every conflicting provider role.')
  insist(Array.isArray(input.recipients) && input.recipients.length === plan.roles.length, `Name one person for each of the ${plan.roles.length} combined roles.`)
  const recipients = input.recipients
  const signers = plan.roles.map((role, index) => {
    const person = object(recipients[index]), code = person.accessCode === undefined || person.accessCode === '' ? undefined : person.accessCode
    insist(person.group === undefined, 'Name a person for each combined role.')
    insist(!role.accessCode || code !== undefined, `Enter the access code for ${role.role} at order ${role.order}.`)
    insist(role.accessCode || code === undefined, `The ${role.role} role does not use an access code.`)
    return { ...(role.payment ? { payment: structuredClone(role.payment), paymentConsent: true } : {}), name:role.unresolvedIdentity?'':person.name, email:role.unresolvedIdentity?'':person.email, ...(role.unresolvedIdentity?{unresolvedIdentity:true as const}:{}), ...(role.delegates?{delegates:role.delegates}:{}), order: role.order, ...(role.action ? { role: role.action } : {}),
      ...(role.witnesses ? { witnesses: structuredClone(role.witnesses) } : {}), ...(role.includeWhen ? { includeWhen: role.includeWhen } : {}),
      ...(role.providerAuth?{providerAuth:role.providerAuth}:{}), sms: role.identity === 'sms', linkOnly: role.identity === 'link', ...(['sms','voice'].includes(role.identity) ? { phone: person.phone } : {}),
      ...(code === undefined ? {} : { accessCode: code }), ...(role.message ? { message: role.message } : {}) }
  })
  const additional = input.documents === undefined ? [] : input.documents
  insist(Array.isArray(additional) && additional.length + plan.documents.length <= 20, 'Add at most 20 documents including the templates.')
  const uploads = additional.map(value => {
    const descriptor = object(value)
    insist(Object.keys(descriptor).every(key => key === 'uploadId' || key === 'mode') && descriptor.mode === 'view', 'Additional composition documents must be uploaded view-only PDFs.')
    return { uploadId: text(descriptor.uploadId, 'a PDF upload ID'), mode: 'view' as const }
  })
  const originals: Uint8Array[] = [], artifacts = []
  // Validate combined originals as well as every component; copies below use verified in-memory bytes, never mutable source rows.
  for (const [index, { template }] of sources.entries()) {
    const [combined, supplements] = await Promise.all([templateBytes(env, template), supplementsFromTemplate(env, template)])
    if (template.documents) for (const [document] of template.documents.entries()) originals.push(await templateOriginal(env, template, document))
    else originals.push(combined)
    for (const artifact of supplements) artifacts.push({ ...artifact, supplement: { ...artifact.supplement, id: `t${index + 1}_${artifact.supplement.id}` } })
  }
  insist(artifacts.length <= 20 && new Set(artifacts.map(a => a.supplement.id)).size === artifacts.length, 'Keep at most 20 supplemental documents with distinct source identities.')
  const retained = plan.documents.map((document, index) => ({ ...document, bytes: originals[index].length })) as EnvelopeDocument[]
  const descriptors = [...retained.map((document, existing) => ({ existing, mode: document.mode, visibleTo: document.visibleTo })), ...uploads]
  const multiple = await readDocuments(env, { documents: descriptors }, context.actor, undefined, { documents: retained, read: async index => originals[index] })
  insist(multiple, 'The combined documents could not be prepared.', 503)
  const strictProfile = sources.find(source => source.template.part11)?.template.part11
  insist(!strictProfile || !plan.settings.allowPaper, 'Choose settings without paper signing when any source template uses the electronic compliance profile.', 409)
  const createdAt = now(), prepared = { bytes: multiple.bytes, documents: multiple.documents, composition: true as const }
  const { draft, accessCodes } = await readDraft(env, { customFields:customEnvelopeFields(input.customFields,mergeCustomFields(sources.map(s=>s.template.customFields??[]))),tags:[...new Set(sources.flatMap(s=>s.template.tags??[]))].slice(0,10),title: plan.settings.title, filename: 'combined.pdf', signers, fields: plan.fields,
    expiresAt: new Date(Date.parse(createdAt) + plan.settings.expiryDays * 86_400_000).toISOString(), reminders: plan.settings.reminders ?? null,
    ...(plan.settings.allowPaper ? { allowPaperSigning: true } : {}), allowReassignment: Boolean(plan.settings.allowReassign),
    ...(plan.settings.subject ? { subject: plan.settings.subject } : {}), ...(plan.settings.message ? { message: plan.settings.message } : {}) }, createdAt, undefined, context.actor, prepared, plan.settings.adoptionMethods, plan.settings.consumerDisclosure, plan.roles.map(role => ({payment:role.payment,paymentAuthority:role.paymentAuthority})))
  const templates = plan.templates, approvalRules = sources.flatMap(source => source.template.approval ? [structuredClone(source.template.approval)] : [])
  const envelope = { id: id(), version: 1, status: 'prepared' as const, createdAt, createdBy: context.actor.id, ...draft,
    ...(strictProfile ? { part11: structuredClone(strictProfile) } : {}), ...(artifacts.length ? { supplements: artifacts.map(a => a.supplement) } : {}),
    templates, template: templates[0], ...(approvalRules.length ? { approvalRules, approvalRule: approvalRules[0] } : {}), events: [] } satisfies Envelope
  await appendEvent(envelope, 'envelope.prepared', context.actor.id, { ...draftDetail(draft), ...(envelope.part11 ? { part11: envelope.part11 } : {}),
    ...(envelope.supplements ? { supplements: envelope.supplements } : {}), templates, template: { ...templates[0], roles: plan.roles.map(role => role.role) },
    approvalRules, composition: { choices, settingsTemplate: plan.settingsTemplate, conflicts: plan.conflicts, roles: plan.roles.map(({ key, role, order, sources: from }) => ({ key, role, order, sources: from })) } })
  const result = { id: envelope.id }
  await insertEnvelope(env.DB, envelope, context.actor, [...await stagedBlobWrites(env, envelope.id, 'original', multiple.bytes),
    ...await documentWrites(env, envelope.id, multiple.originals), ...artifacts.flatMap(a => blobWrites(env.DB, envelope.id, `supplement-${a.supplement.id}`, a.bytes)),
    ...await accessCodeWrites(env, envelope.id, accessCodes), ...consumedUploadWrites(env, { documents: uploads }),
    commandWrite(env.DB, context.actor.id, context.commandId, context.fingerprint, result)], sources.map(source => sourceGuard(context.actor, source)))
  await readBlob(env, envelope.id, 'original', envelope.originalSha256)
  return result
}
