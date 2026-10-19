// ROUTE-008: the account's shared contact book (Settings) and the picker that fills recipients from it and from the
// member's recent recipients while preparing an envelope. Owners, admins and senders use both.
import { useEffect, useState, type FormEvent } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'

export type Contact = { name: string; email: string; phone: string | null; company: string | null }
type Book = { contacts: Contact[]; total: number; recent: Contact[] }
const detail = (contact: Contact) => [contact.email, contact.company, contact.phone].filter(Boolean).join(' · ')

/** Search the book as the sender types (name, email or company); with nothing typed, offer recent recipients. */
export function ContactPicker({ onPick }: { onPick: (contact: Contact, as: 'signer' | 'copy') => void }) {
  const [q, setQ] = useState('')
  const [book, setBook] = useState<Book>()
  const action = useAction()
  useEffect(() => { const timer = setTimeout(() => void action.run(async () => setBook(await request<Book>(`/api/inkwell/contacts?limit=8&q=${encodeURIComponent(q.trim())}`))), 150); return () => clearTimeout(timer) }, [q])
  const shown = q.trim() ? book?.contacts ?? [] : book?.recent ?? []
  return <div className="iw-contact-picker iw-stack">
    <label>Find a contact<input type="search" placeholder="Name, email or company" value={q} maxLength={200} onChange={event => setQ(event.target.value)} /></label>
    {shown.length > 0 && <div><p className="iw-muted">{q.trim() ? `Contacts matching “${q.trim()}”` : 'Recent recipients'}</p><ul className="iw-contact-results" aria-label={q.trim() ? 'Matching contacts' : 'Recent recipients'}>{shown.map(contact => <li key={contact.email}><span><strong>{contact.name}</strong><small className="iw-muted">{detail(contact)}</small></span><span className="iw-actions"><button type="button" aria-label={`Add ${contact.name} as a recipient`} onClick={() => onPick(contact, 'signer')}>Recipient</button><button type="button" aria-label={`Add ${contact.name} to receive a copy`} onClick={() => onPick(contact, 'copy')}>Copy</button></span></li>)}</ul></div>}
    {q.trim() && book && !book.contacts.length && <p className="iw-muted" role="status">No contact matches.</p>}
    <ErrorNotice error={action.error} />
  </div>
}

/** Settings → Contacts: search, add or change one, remove one, and import a CSV. */
export function ContactBook() {
  const [q, setQ] = useState('')
  const [book, setBook] = useState<Book>()
  const [draft, setDraft] = useState<Contact>({ name: '', email: '', phone: '', company: '' })
  const [imported, setImported] = useState<{ added: number; updated: number; refused: { line: number; reason: string }[] }>()
  const action = useAction()
  const load = async () => setBook(await request<Book>(`/api/inkwell/contacts?limit=50&q=${encodeURIComponent(q.trim())}`))
  useEffect(() => { const timer = setTimeout(() => void action.run(load), 150); return () => clearTimeout(timer) }, [q])
  function add(event: FormEvent) { event.preventDefault(); void action.run(async () => { await request('/api/inkwell/contacts', draft); setDraft({ name: '', email: '', phone: '', company: '' }); await load() }) }
  function importCsv(file: File) { void action.run(async () => {
    const response = await fetch('/api/inkwell/contacts/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'text/csv' }, body: file })
    const payload = await response.json().catch(() => null) as { result?: typeof imported; error?: string } | null
    if (!response.ok || !payload?.result) throw new Error(payload?.error ?? `Import failed (${response.status})`)
    setImported(payload.result); await load()
  }) }
  const field = (key: keyof Contact, label: string, type = 'text', required = false) => <label>{label}<input type={type} required={required} maxLength={key === 'email' ? 254 : key === 'phone' ? 40 : 160} value={draft[key] ?? ''} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>
  return <section className="iw-panel iw-stack"><h2>Contacts</h2>
    <p className="iw-muted">One contact book for everyone who sends. Pick recipients from it while preparing an envelope. Saving or importing an email already here updates that contact.</p>
    <ErrorNotice error={action.error} />
    <form className="iw-contact-form" onSubmit={add}>{field('name', 'Name', 'text', true)}{field('email', 'Email', 'email', true)}{field('phone', 'Phone', 'tel')}{field('company', 'Company')}<button className="iw-primary iw-fit" disabled={action.busy}>Save contact</button></form>
    <label>Import contacts from CSV<input type="file" accept=".csv,text/csv" disabled={action.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importCsv(file) }} /></label>
    <p className="iw-muted">The first row names the columns: name and email, and optionally phone and company. Up to 1,000 rows.</p>
    {imported && <div role="status" className="iw-callout"><p>Imported: {imported.added} added, {imported.updated} updated{imported.refused.length ? `, ${imported.refused.length} not imported` : ''}.</p>{imported.refused.length > 0 && <ul>{imported.refused.map(row => <li key={row.line}>{row.reason}</li>)}</ul>}</div>}
    <label>Search contacts<input type="search" placeholder="Name, email or company" value={q} maxLength={200} onChange={event => setQ(event.target.value)} /></label>
    {book && <p className="iw-muted">{book.total} {book.total === 1 ? 'contact' : 'contacts'}{book.total > book.contacts.length ? `, showing the first ${book.contacts.length}` : ''}</p>}
    <ul className="iw-contact-results" aria-label="Contacts">{book?.contacts.map(contact => <li key={contact.email}><span><strong>{contact.name}</strong><small className="iw-muted">{detail(contact)}</small></span><button type="button" disabled={action.busy} aria-label={`Remove ${contact.name}`} onClick={() => void action.run(async () => { await request('/api/inkwell/contacts/remove', { email: contact.email }); await load() })}>Remove</button></li>)}</ul>
  </section>
}
