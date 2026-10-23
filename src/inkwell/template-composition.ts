import {validateDelegationGrants} from './delegation-grants'
import { canonical, insist, type Field, type RoutingRule, type WitnessRule } from './model'
import type { Role, Template } from './templates'
import type { EnvelopeDocument } from './documents'
import { validateRecipientCount } from './recipient-roles'

type Identity = 'email' | 'link' | 'sms'
type Source = { template: number; role: number }
export interface CompositionChoices { settingsTemplate?: string; identity?: Record<string, Identity>; orders?: Record<string, number | null> }
export interface CompositionRole extends Role {
  key: string; sms?: boolean; identity: Identity; sources: Source[]
  messages: { template: number; role: number; message: string }[]
}
export interface CompositionConflict {
  kind: 'order' | 'identity' | 'reminders' | 'expiry' | 'witnesses' | 'message'
  message: string; templates: number[]; role?: string; proposed?: unknown; selected?: unknown; orders?: number[]
}
export type CompositionDocument = Omit<EnvelopeDocument, 'bytes' | 'signedSha256'> & { bytes?: number }
const method = (r: Role & { sms?: boolean }): Identity => r.sms ? 'sms' : r.linkOnly ? 'link' : 'email'
const priority: Record<Identity, number> = { link: 0, email: 1, sms: 2 }

function combineWitnesses(a: WitnessRule | undefined, b: WitnessRule | undefined): WitnessRule | undefined {
  if (!a || !b) return structuredClone(a ?? b)
  const named = [...new Map([...(a.named ?? []), ...(b.named ?? [])].map(n => [n.email.toLowerCase(), n])).values()]
  const maximum = Math.max(a.maximum, b.maximum) as WitnessRule['maximum']
  insist(named.length <= maximum, 'The merged role names more witnesses than its witness limit. Change the templates before combining.', 409)
  return { minimum: Math.max(a.minimum, b.minimum) as WitnessRule['minimum'], maximum,
    ...(a.address || b.address ? { address: true } : {}), ...(a.linkOnly && b.linkOnly ? { linkOnly: true } : {}), ...(named.length ? { named } : {}) }
}

/** Ordered metadata only. Callers authorize every template and load/fingerprint all original bytes before preparing.
 * Identity choice keys are the stable role keys returned here, JSON.stringify([trimmed label, routing order]). */
export function composition(templates: Template[], choices: CompositionChoices = {}) {
  insist(templates.length >= 2, 'Choose at least two templates to combine.')
  insist(new Set(templates.map(t => t.id)).size === templates.length, 'Choose each template once.')
  const selectedSettings = choices.settingsTemplate === undefined ? 0 : templates.findIndex(t => t.id === choices.settingsTemplate)
  insist(selectedSettings >= 0, 'Choose envelope settings from one of the selected templates.')
  const orderConflicts = [...new Set(templates.flatMap(t=>t.roles.map(r=>r.role.trim())))].flatMap(label=>{
    const orders=[...new Set(templates.flatMap(t=>t.roles.filter(r=>r.role.trim()===label).map(r=>r.order)))].sort((a,b)=>a-b)
    return orders.length>1?[{label,orders}]:[]
  })
  for(const [label,order] of Object.entries(choices.orders??{}))insist(orderConflicts.some(c=>c.label===label&&(order===null||c.orders.includes(order))), 'Choose an existing routing order for a conflicting role.')
  const conflicts: CompositionConflict[] = orderConflicts.map(c=>({kind:'order',role:c.label,orders:c.orders,templates:templates.flatMap((t,i)=>t.roles.some(r=>r.role.trim()===c.label)?[i]:[]),selected:choices.orders?.[c.label]??null,
    message:choices.orders?.[c.label] ? `${c.label} appears at routing orders ${c.orders.join(', ')}; merge at the selected order ${choices.orders[c.label]}.` : `${c.label} appears at routing orders ${c.orders.join(', ')} and remains separate recipients.`}))
  templates=templates.map(t=>({...t,roles:t.roles.map(r=>choices.orders?.[r.role.trim()] ? {...r,order:choices.orders[r.role.trim()]!}:r)}))
  const settingsTemplate = templates[selectedSettings], roles: CompositionRole[] = []
  const roleIndexes = templates.map(() => [] as number[]), methods = new Map<string, Identity[]>(), byKey = new Map<string, number>()
  const ids = templates.map((t, index) => {
    const map = new Map(t.fields.map((f, fieldIndex) => {
      const prefix = `t${index + 1}_f${fieldIndex + 1}_`; return [f.id, prefix + f.id.slice(0, 80 - prefix.length)]
    }))
    insist(map.size === t.fields.length, 'A template contains duplicate field IDs.', 409)
    return map
  })
  const fieldId = (template: number, value: string) => {
    const mapped = ids[template].get(value); insist(mapped, 'A template references a missing field.', 409); return mapped
  }
  const rule = (template: number, value?: RoutingRule): RoutingRule | undefined => value ? { ...value, field: fieldId(template, value.field) } : undefined
  for (const [ti, t] of templates.entries()) for (const [ri, original] of t.roles.entries()) {
    const label = original.role.trim(), key = JSON.stringify([label, original.order]), identity = method(original), source = { template: ti, role: ri }
    insist(label, 'Every template role needs a name.', 409)
    const includeWhen = rule(ti, original.includeWhen), existing = byKey.get(key)
    const seenMethods = methods.get(key) ?? []; seenMethods.push(identity); methods.set(key, seenMethods)
    if (existing === undefined) {
      byKey.set(key, roles.length); roleIndexes[ti][ri] = roles.length
      roles.push({ ...structuredClone(original), role: label, key, identity, includeWhen, sources: [source],
        messages: original.message ? [{ ...source, message: original.message }] : [] })
      continue
    }
    const merged = roles[existing]; roleIndexes[ti][ri] = existing
    insist(Boolean(merged.unresolvedIdentity)===Boolean(original.unresolvedIdentity), `Role ${label} has incompatible open-identity requirements. Change the templates before combining.`,409)
    insist((merged.action ?? 'signer') === (original.action ?? 'signer'), `Role ${label} at order ${original.order} has incompatible actions. Change the templates before combining.`, 409)
    insist(canonical(merged.includeWhen ?? null) === canonical(includeWhen ?? null), `Role ${label} at order ${original.order} has incompatible routing conditions. Change the templates before combining.`, 409)
    if (canonical(merged.witnesses ?? null) !== canonical(original.witnesses ?? null)) conflicts.push({ kind: 'witnesses', role: key, templates: [...merged.sources.map(s => s.template), ti],
      message: `${label}: witness requirements differ; the merged role retains the stricter requirements.` })
    merged.witnesses = combineWitnesses(merged.witnesses, original.witnesses)
    merged.accessCode = Boolean(merged.accessCode || original.accessCode)
    merged.sources.push(source)
    if (original.message) merged.messages.push({ ...source, message: original.message })
  }
  for(const r of roles) {
    const granted=r.sources.flatMap(source=>(templates[source.template].roles[source.role].delegates??[]).map(place=>roleIndexes[source.template][place]));
    if(granted.length)r.delegates=[...new Set(granted)];
  }
  validateDelegationGrants(roles.map(r=>({...r,role:r.action,name:r.role,email:''})))
  for (const key of Object.keys(choices.identity ?? {})) insist(byKey.has(key), 'An identity choice names an unknown merged role.')
  for (const r of roles) {
    const alternatives = [...new Set(methods.get(r.key)!)], proposed = alternatives.reduce((a, b) => priority[a] >= priority[b] ? a : b)
    const selected = choices.identity?.[r.key] ?? proposed
    insist(['email', 'link', 'sms'].includes(selected), 'Choose email code, SMS code or link only.')
    r.identity = selected; r.linkOnly = selected === 'link'; r.sms = selected === 'sms'
    if (alternatives.length > 1) conflicts.push({ kind: 'identity', role: r.key, templates: r.sources.map(s => s.template), proposed, selected,
      message: `${r.role}: authentication methods conflict (${alternatives.join(', ')}); propose ${proposed === 'sms' ? 'SMS code' : proposed === 'email' ? 'email code' : 'link only'}.` })
    const messages = [...new Set(r.messages.map(m => m.message))]
    r.message = messages.length > 1 ? r.messages.map(m => `${templates[m.template].title}: ${m.message}`).join('\n\n') : messages[0]
    insist(!r.message || r.message.length <= 1000, `The merged private message for ${r.role} exceeds 1000 characters. Shorten the source messages.`, 409)
    if (messages.length > 1) conflicts.push({ kind: 'message', role: r.key, templates: r.sources.map(s => s.template), message: `${r.role}: private messages are combined with their template names.` })
  }
  for (const [kind, property] of [['reminders', 'reminders'], ['expiry', 'expiryDays']] as const) {
    if (templates.some(t => canonical(t[property] ?? null) !== canonical(templates[0][property] ?? null))) conflicts.push({ kind, templates: templates.map((_, i) => i),
      message: `Templates disagree about ${kind}; use ${settingsTemplate.title}'s settings.`, proposed: templates[0][property] ?? null, selected: settingsTemplate[property] ?? null })
  }
  const documents: CompositionDocument[] = [], documentSources: { template: number; document?: number }[] = [], fields: Field[] = []
  let totalPages = 0, knownBytes = 0
  for (const [ti, t] of templates.entries()) {
    const startDocument = documents.length, startPage = totalPages
    const sourceDocuments: CompositionDocument[] = t.documents ?? [{ filename: t.filename, sha256: t.originalSha256, pages: t.pageSizes.length, pageStart: 0, mode: 'sign' }]
    for (const [di, d] of sourceDocuments.entries()) {
      const audience = d.visibleTo?.signers ?? t.roles.map((_, i) => i)
      insist(audience.every(i => roleIndexes[ti][i] !== undefined), 'A template document references an unknown role.', 409)
      documents.push({ filename: d.filename, sha256: d.sha256, ...(d.bytes === undefined ? {} : { bytes: d.bytes }), pages: d.pages, pageStart: totalPages, mode: d.mode,
        visibleTo: { signers: [...new Set(audience.map(i => roleIndexes[ti][i]))], copies: [] } })
      documentSources.push({ template: ti, ...(t.documents ? { document: di } : {}) }); totalPages += d.pages; knownBytes += d.bytes ?? 0
    }
    for (const f of t.fields) {
      const localDocument = f.document ?? sourceDocuments.findIndex(d => f.page >= d.pageStart && f.page < d.pageStart + d.pages), d = sourceDocuments[localDocument]
      insist(d && roleIndexes[ti][f.signer] !== undefined, 'A template field references an unknown document or role.', 409)
      const localPage = f.documentPage ?? f.page - d.pageStart
      insist(Number.isInteger(localPage) && localPage >= 0 && localPage < d.pages, 'A template field references an invalid page.', 409)
      fields.push({ ...structuredClone(f), id: fieldId(ti, f.id), signer: roleIndexes[ti][f.signer], document: startDocument + localDocument,
        documentPage: localPage, page: startPage + d.pageStart + localPage,
        ...(f.condition ? { condition: { ...f.condition, field: fieldId(ti, f.condition.field) } } : {}),
        ...(f.requiredWhen ? { requiredWhen: { ...f.requiredWhen, field: fieldId(ti, f.requiredWhen.field) } } : {}),
        ...(f.calculation ? { calculation: { ...f.calculation, fields: f.calculation.fields.map(value => fieldId(ti, value)) } } : {}) })
    }
  }
  insist(documents.length <= 20, 'An envelope has at most 20 documents.')
  insist(totalPages <= 2000 && knownBytes <= 100 * 1024 * 1024, 'Combined templates exceed the envelope document capacity.')
  validateRecipientCount(roles.map(r => ({ name: r.role, email: '', role: r.action, witnesses: r.witnesses })), 0)
  return { templates: templates.map(t => ({ id: t.id, title: t.title, version: t.version ?? 1 })), roles, roleIndexes, documents, documentSources, fields, conflicts,
    pageSizes: templates.flatMap(t => structuredClone(t.pageSizes)), settingsTemplate: settingsTemplate.id,
    settings: { consumerDisclosure: structuredClone(settingsTemplate.consumerDisclosure ?? null), adoptionMethods: structuredClone<import('./model').AdoptionMethod[]>(settingsTemplate.adoptionMethods ?? ['typed','drawn','uploaded']), title: settingsTemplate.title, filename: 'combined.pdf', expiryDays: settingsTemplate.expiryDays, reminders: structuredClone(settingsTemplate.reminders),
      subject: settingsTemplate.subject, message: settingsTemplate.message, allowPaper: settingsTemplate.allowPaper, allowReassign: settingsTemplate.allowReassign, approval: structuredClone(settingsTemplate.approval) } }
}
