import { canonical, id, insist, now, object, sha256, text } from './model'
import type { Contact } from './contacts'
import type { Guard } from './storage'
import { hubspotRequest, type HubspotCredential, type HubspotEnv } from './hubspot-provider'
import type { SyncDefinition, SyncRun } from './hubspot-sync-definition'
export interface Source { account_id: string; record_id: string; email: string; contact_json: string; ignored_hash: string | null }
export interface ProviderContact { id: string; contact: Contact }
const currentContact = (env: HubspotEnv, email: string) => env.DB.prepare('SELECT name,email,phone,company FROM iw_contacts WHERE email=?').bind(email).first<Contact>()
const same = (a: Contact | null, b: Contact | null) => canonical(a) === canonical(b)
export function mappedContactValues(contact: Contact, definition: SyncDefinition) { return { name: contact.name, email: contact.email, ...(definition.mappings.phone ? { phone: contact.phone } : {}), ...(definition.mappings.company ? { company: contact.company } : {}) } }
export const providerContactHash = (contact: Contact, definition: SyncDefinition) => sha256(canonical(mappedContactValues(contact, definition)))
const mappedSame = (a: Contact, b: Contact, definition: SyncDefinition) => canonical(mappedContactValues(a, definition)) === canonical(mappedContactValues(b, definition))
export function preserveUnmapped(provider: Contact, local: Contact | null, definition: SyncDefinition): Contact { return { ...provider, ...(!definition.mappings.phone ? { phone: local?.phone ?? null } : {}), ...(!definition.mappings.company ? { company: local?.company ?? null } : {}) } }
export function contactGuard(contact: Contact | null, email: string): Guard {
  return contact ? { sql: 'EXISTS(SELECT 1 FROM iw_contacts WHERE email=? AND name=? AND phone IS ? AND company IS ?)', values: [email, contact.name, contact.phone, contact.company] } : { sql: 'NOT EXISTS(SELECT 1 FROM iw_contacts WHERE email=?)', values: [email] }
}
function mappedContact(value: unknown, definition: SyncDefinition): ProviderContact {
  const row = object(value), properties = object(row.properties), id = text(row.id, 'a HubSpot record identity', 100)
  insist(/^[a-zA-Z0-9_-]+$/.test(id), 'HubSpot returned an invalid record identity.', 502)
  insist(!row.archived, 'HubSpot returned an archived contact.', 502)
  const valueOf = (key: string) => properties[key] === null || properties[key] === undefined || properties[key] === '' ? '' : text(properties[key], 'a contact property', 254)
  const email = valueOf('email').toLowerCase(), name = [valueOf('firstname'), valueOf('lastname')].filter(Boolean).join(' ')
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && name.length > 0 && name.length <= 160, 'HubSpot returned invalid contact details.', 502)
  const phone = definition.mappings.phone ? valueOf('phone') || null : null, company = definition.mappings.company ? valueOf('company') || null : null
  insist((phone === null || /^\+?[0-9 ().-]{4,40}$/.test(phone)) && (company === null || company.length <= 160), 'HubSpot returned invalid contact details.', 502)
  return { id, contact: { name, email, phone, company } }
}
/** One bounded page; selected scope never reads records outside the approved ID set. */
export async function readHubspotContactsPage(env: HubspotEnv, credential: HubspotCredential, definition: SyncDefinition, cursor: string | null) {
  let data: Record<string, unknown>, next: string | null
  if (definition.scope.kind === 'selected') {
    const offset = cursor === null ? 0 : Number(cursor), ids = definition.scope.recordIds!.slice(offset, offset + 100)
    insist(Number.isSafeInteger(offset) && offset >= 0 && ids.length > 0, 'The selected-contact continuation is invalid.', 409)
    data = await hubspotRequest(env, credential, '/crm/v3/objects/contacts/batch/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: definition.properties, inputs: ids.map(id => ({ id })) }) })
    next = offset + ids.length < definition.scope.recordIds!.length ? String(offset + ids.length) : null
    insist(Array.isArray(data.results) && data.results.length === ids.length && (data.errors === undefined || Array.isArray(data.errors) && data.errors.length === 0) && data.status !== 'PENDING', 'HubSpot did not return every selected contact.', 502)
    insist(data.results.every(value => ids.includes(String(object(value).id))), 'HubSpot returned a contact outside the approved scope.', 502)
  } else {
    const params = new URLSearchParams({ limit: '100', properties: definition.properties.join(','), archived: 'false' })
    if (cursor !== null) params.set('after', cursor)
    data = await hubspotRequest(env, credential, '/crm/v3/objects/contacts?' + params)
    const paging = data.paging === undefined ? null : object(data.paging), following = paging?.next === undefined ? null : object(paging.next)
    next = following ? text(following.after, 'a HubSpot continuation', 100) : null
    insist(next === null || /^[a-zA-Z0-9_-]+$/.test(next) && next !== cursor, 'HubSpot returned an invalid continuation.', 502)
  }
  insist(Array.isArray(data.results) && data.results.length <= 100, 'HubSpot returned an invalid contact page.', 502)
  const records = data.results.map(value => mappedContact(value, definition))
  insist(new Set(records.map(row => row.id)).size === records.length && new Set(records.map(row => row.contact.email)).size === records.length, 'HubSpot returned duplicate contact identities.', 502)
  return { records, next }
}
export function contactWrite(env: HubspotEnv, contact: Contact, actor: string) {
  const at = now()
  return env.DB.prepare('INSERT INTO iw_contacts(email,name,phone,company,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,company=excluded.company,updated_at=excluded.updated_at').bind(contact.email, contact.name, contact.phone, contact.company, actor, at, at)
}
export function sourceWrite(env: HubspotEnv, accountId: string, recordId: string, contact: Contact, ignored: string | null = null, email = contact.email) {
  return env.DB.prepare('INSERT INTO iw_hubspot_sources(account_id,record_id,email,contact_json,ignored_hash) VALUES(?,?,?,?,?) ON CONFLICT(account_id,record_id) DO UPDATE SET email=excluded.email,contact_json=excluded.contact_json,ignored_hash=excluded.ignored_hash').bind(accountId, recordId, email, canonical(contact), ignored)
}
/** Two bounded reads and JSON batch guards stay below D1's per-query parameter limit for a full provider page. */
export async function reconcileHubspotPage(env: HubspotEnv, accountId: string, run: SyncRun, rows: ProviderContact[], actor: string, definition: SyncDefinition) {
  const sourceRows = (await env.DB.prepare('SELECT * FROM iw_hubspot_sources WHERE account_id=? AND (record_id IN(SELECT value FROM json_each(?)) OR email IN(SELECT value FROM json_each(?)))').bind(accountId, JSON.stringify(rows.map(row => row.id)), JSON.stringify(rows.map(row => row.contact.email))).all<Source>()).results
  const sources = new Map(sourceRows.map(source => [source.record_id, source])), emails = [...new Set([...rows.map(row => row.contact.email), ...sourceRows.map(source => source.email)])]
  const contacts = new Map((await env.DB.prepare('SELECT name,email,phone,company FROM iw_contacts WHERE email IN(SELECT value FROM json_each(?))').bind(JSON.stringify(emails)).all<Contact>()).results.map(contact => [contact.email, contact]))
  const expectedContacts = emails.map(email => ({ email, exists: contacts.has(email) ? 1 : 0, ...(contacts.get(email) ?? {}) })), expectedSources = rows.map(row => ({ recordId: row.id, exists: sources.has(row.id) ? 1 : 0, baseline: sources.get(row.id)?.contact_json ?? null, ignored: sources.get(row.id)?.ignored_hash ?? null }))
  const guards: Guard[] = [
    { sql: "NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE (json_extract(j.value,'$.exists')=0 AND EXISTS(SELECT 1 FROM iw_contacts c WHERE c.email=json_extract(j.value,'$.email'))) OR (json_extract(j.value,'$.exists')=1 AND NOT EXISTS(SELECT 1 FROM iw_contacts c WHERE c.email=json_extract(j.value,'$.email') AND c.name=json_extract(j.value,'$.name') AND c.phone IS json_extract(j.value,'$.phone') AND c.company IS json_extract(j.value,'$.company'))))", values: [JSON.stringify(expectedContacts)] },
    { sql: "NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE (json_extract(j.value,'$.exists')=0 AND EXISTS(SELECT 1 FROM iw_hubspot_sources s WHERE s.account_id=? AND s.record_id=json_extract(j.value,'$.recordId'))) OR (json_extract(j.value,'$.exists')=1 AND NOT EXISTS(SELECT 1 FROM iw_hubspot_sources s WHERE s.account_id=? AND s.record_id=json_extract(j.value,'$.recordId') AND s.contact_json=json_extract(j.value,'$.baseline') AND s.ignored_hash IS json_extract(j.value,'$.ignored'))))", values: [JSON.stringify(expectedSources), accountId, accountId] },
  ]
  const writes: D1PreparedStatement[] = [], upserts: Contact[] = [], deleted: string[] = [], linked: { recordId: string; email: string; baseline: string }[] = [], pending: { id: string; recordId: string; baseline: string; localEmail: string }[] = [], resolved: string[] = []
  const hashes = await Promise.allSettled(rows.map(row => providerContactHash(row.contact, definition)))
  for (const [index, row] of rows.entries()) {
    const source = sources.get(row.id), local = contacts.get(source?.email ?? row.contact.email) ?? null, collision = contacts.get(row.contact.email), hash = hashes[index]
    if (hash.status === 'rejected') throw hash.reason
    row.contact = preserveUnmapped(row.contact, local, definition)
    if (source?.ignored_hash === hash.value) continue
    const foreignIdentity = sourceRows.some(candidate => candidate.email === row.contact.email && candidate.record_id !== row.id)
    const conflict = foreignIdentity || (source ? !local || !mappedSame(local, JSON.parse(source.contact_json), definition) || source.email !== row.contact.email && collision : local && !mappedSame(local, row.contact, definition))
    if (conflict) { pending.push({ id: id(), recordId: row.id, baseline: canonical(row.contact), localEmail: source?.email ?? row.contact.email }); continue }
    if (!same(local, row.contact)) { if (source && source.email !== row.contact.email) deleted.push(source.email); upserts.push(row.contact) }
    linked.push({ recordId: row.id, email: row.contact.email, baseline: canonical(row.contact) }); resolved.push(row.id)
  }
  if (deleted.length) writes.push(env.DB.prepare('DELETE FROM iw_contacts WHERE email IN(SELECT value FROM json_each(?))').bind(JSON.stringify(deleted)))
  if (upserts.length) { const at = now(); writes.push(env.DB.prepare("INSERT INTO iw_contacts(email,name,phone,company,created_by,created_at,updated_at) SELECT json_extract(value,'$.email'),json_extract(value,'$.name'),json_extract(value,'$.phone'),json_extract(value,'$.company'),?,?,? FROM json_each(?) WHERE 1 ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,company=excluded.company,updated_at=excluded.updated_at").bind(actor, at, at, JSON.stringify(upserts))) }
  if (linked.length) writes.push(env.DB.prepare("INSERT INTO iw_hubspot_sources(account_id,record_id,email,contact_json,ignored_hash) SELECT ?,json_extract(value,'$.recordId'),json_extract(value,'$.email'),json_extract(value,'$.baseline'),NULL FROM json_each(?) WHERE 1 ON CONFLICT(account_id,record_id) DO UPDATE SET email=excluded.email,contact_json=excluded.contact_json,ignored_hash=NULL").bind(accountId, JSON.stringify(linked)))
  if (pending.length) writes.push(env.DB.prepare("INSERT INTO iw_hubspot_conflicts(id,account_id,record_id,run_id,contact_json,local_email,status) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.recordId'),?,json_extract(value,'$.baseline'),json_extract(value,'$.localEmail'),'open' FROM json_each(?) WHERE 1 ON CONFLICT(account_id,record_id) DO UPDATE SET run_id=excluded.run_id,contact_json=excluded.contact_json,local_email=excluded.local_email,status='open'").bind(accountId, run.id, JSON.stringify(pending)))
  if (resolved.length) writes.push(env.DB.prepare("UPDATE iw_hubspot_conflicts SET status='resolved' WHERE account_id=? AND record_id IN(SELECT value FROM json_each(?))").bind(accountId, JSON.stringify(resolved)))
  return { guards, writes, applied: upserts.length, conflicts: pending.length }
}
export { currentContact }
