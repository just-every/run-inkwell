import { insist, now, object, text, type Actor, type Envelope, type Env } from './model'
import { readBytes } from './body'

/** ROUTE-008: the account's shared contact book. Owners, admins and senders read, add, change, remove and import
 * contacts (viewers and agent tokens cannot); a contact is one email, kept in lower case, with a name and an optional
 * phone and company. Saving or importing an email already in the book updates that contact. */
export type Contact = { name: string; email: string; phone: string | null; company: string | null }
const columns = ['name', 'email', 'phone', 'company'] as const
const like = (value: string) => '%' + value.replace(/[\\%_]/g, c => '\\' + c) + '%'

function contact(input: Record<string, unknown>, at = ''): Contact {
  const email = text(input.email, `an email${at}`, 254).toLowerCase()
  insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `Provide a valid email${at}.`)
  const optional = (value: unknown, label: string, max: number) => value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? null : text(value, label + at, max)
  const phone = optional(input.phone, 'a phone number', 40)
  insist(phone === null || /^\+?[0-9 ().-]{4,40}$/.test(phone), `Give the phone number as digits, spaces, brackets, dots or dashes, with an optional leading +${at}.`)
  return { name: text(input.name, `a name${at}`, 160), email, phone, company: optional(input.company, 'a company', 160) }
}
const upsert = (env: Env, actor: Actor, c: Contact, at: string) => env.DB.prepare('INSERT INTO iw_contacts (email,name,phone,company,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,company=excluded.company,updated_at=excluded.updated_at').bind(c.email, c.name, c.phone, c.company, actor.id, at, at)

/** Contacts whose name, email or company contains the search, case-insensitively, by name, 1–100 at a time. */
export async function searchContacts(env: Env, params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim().toLowerCase(), limit = params.has('limit') ? Number(params.get('limit')) : 20, offset = params.has('offset') ? Number(params.get('offset')) : 0
  insist(q.length <= 200, 'Search for at most 200 characters.')
  insist(Number.isInteger(limit) && limit >= 1 && limit <= 100 && Number.isInteger(offset) && offset >= 0, 'Ask for 1–100 contacts from a whole-number offset.')
  const where = q ? ` WHERE lower(name) LIKE ?1 ESCAPE '\\' OR email LIKE ?1 ESCAPE '\\' OR lower(company) LIKE ?1 ESCAPE '\\'` : '', values = q ? [like(q)] : []
  const total = (await env.DB.prepare(`SELECT count(*) AS n FROM iw_contacts${where}`).bind(...values).first<{ n: number }>())!.n
  const { results } = await env.DB.prepare(`SELECT name,email,phone,company FROM iw_contacts${where} ORDER BY name COLLATE NOCASE, email LIMIT ${limit} OFFSET ${offset}`).bind(...values).all<Contact>()
  return { contacts: results, total }
}

/** Recent recipients: the last 20 different people (signers and copy recipients) on envelopes this member prepared,
 * newest first, with their company when the book has them. */
export async function recentRecipients(env: Env, actor: Actor) {
  const { results } = await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.createdBy')=? AND json_extract(data,'$.imported') IS NULL ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 100").bind(actor.id).all<{ data: string }>()
  const seen = new Map<string, { name: string; email: string }>()
  for (const row of results) { const envelope = JSON.parse(row.data) as Envelope; for (const person of [...envelope.signers, ...(envelope.copies ?? [])]) { const email = person.email.toLowerCase(); if (!seen.has(email) && seen.size < 20) seen.set(email, { name: person.name, email }) } }
  if (!seen.size) return []
  const book = new Map((await env.DB.prepare(`SELECT name,email,phone,company FROM iw_contacts WHERE email IN (${[...seen.keys()].map(() => '?').join(',')})`).bind(...seen.keys()).all<Contact>()).results.map(c => [c.email, c]))
  return [...seen.values()].map(person => ({ ...person, phone: book.get(person.email)?.phone ?? null, company: book.get(person.email)?.company ?? null }))
}

export async function saveContact(env: Env, actor: Actor, input: Record<string, unknown>) {
  const saved = contact(object(input)); await upsert(env, actor, saved, now()).run(); return saved
}
export async function removeContact(env: Env, input: Record<string, unknown>) {
  const email = text(input.email, 'an email', 254).toLowerCase(), removed = await env.DB.prepare('DELETE FROM iw_contacts WHERE email=?').bind(email).run()
  insist(removed.meta.changes === 1, 'That contact is not in the book.', 404); return { email }
}

/** CSV import: a header row naming name and email (phone and company optional, any order, other columns ignored), then
 * up to 1,000 rows, as UTF-8 up to 1 MiB. Valid rows are added or update the contact with that email; each invalid row
 * is listed with its line number and reason and nothing of it is saved. */
export async function importContacts(env: Env, actor: Actor, request: Request) {
  insist(['text/csv', 'text/plain'].includes(request.headers.get('content-type')?.split(';')[0] ?? ''), 'Send the CSV with Content-Type text/csv.', 415)
  let source: string
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, 1_048_576)).replace(/^﻿/, '') } catch (error) { if (error instanceof Error && 'status' in error) throw error; insist(false, 'The CSV must be UTF-8 text.') }
  const [header, ...rows] = parseCsv(source!).filter(row => row.some(cell => cell.trim()))
  insist(header, 'The CSV is empty.')
  const index = Object.fromEntries(columns.map(name => [name, header.findIndex(cell => cell.trim().toLowerCase() === name)]))
  insist(index.name >= 0 && index.email >= 0, 'The first row must name the columns, including name and email (phone and company are optional).')
  insist(rows.length <= 1000, 'Import at most 1,000 contacts at a time.')
  const at = now(), refused: { line: number; reason: string }[] = [], valid = new Map<string, Contact>()
  rows.forEach((row, i) => { try { const c = contact(Object.fromEntries(columns.filter(name => index[name] >= 0).map(name => [name, row[index[name]] ?? ''])), ` on line ${i + 2}`); valid.set(c.email, c) } catch (error) { refused.push({ line: i + 2, reason: error instanceof Error ? error.message : 'Invalid row.' }) } })
  const existing = new Set<string>()
  for (let i = 0; i < valid.size; i += 90) { const batch = [...valid.keys()].slice(i, i + 90); for (const row of (await env.DB.prepare(`SELECT email FROM iw_contacts WHERE email IN (${batch.map(() => '?').join(',')})`).bind(...batch).all<{ email: string }>()).results) existing.add(row.email) }
  const writes = [...valid.values()].map(c => upsert(env, actor, c, at))
  for (let i = 0; i < writes.length; i += 100) await env.DB.batch(writes.slice(i, i + 100))
  return { added: valid.size - existing.size, updated: existing.size, refused }
}

/** RFC 4180 fields: commas, quoted fields with doubled quotes, CRLF or LF line ends. */
function parseCsv(source: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) { if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false; else cell += ch; continue }
    if (ch === '"' && !cell) quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && source[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}
