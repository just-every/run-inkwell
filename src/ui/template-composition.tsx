import { CustomEnvelopeFields } from './envelope-metadata'
import type { CustomEnvelopeField } from '../inkwell/envelope-metadata'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Template } from './templates'
import { command, request } from './types'
import { ErrorNotice, useAction } from './feedback'
import { uploadDocument } from './ordered-documents'

type Identity = 'email' | 'link' | 'sms' | 'identity' | 'knowledge' | 'voice'
type Choices = { orders?: Record<string, number | null>; settingsTemplate?: string; identity?: Record<string, Identity> }
type Person = { name: string; email: string; phone: string; accessCode: string }
type PreviewRole = {
  role: string; key: string; order: number; action?: Exclude<import('./types').RecipientRole,'witness'>;delegates?:number[];unresolvedIdentity?:true
  identity: Identity; needsIdentityChoice?:boolean; accessCode?: boolean; witnesses?: { minimum: number; maximum: number }
  sources: { template: number; role: number }[]; messages: { template: number; role: number; message: string }[]
}
type Preview = {
  templates: { id: string; title: string; version: number }[]
  roles: PreviewRole[]; documents: { filename: string; pages: number; mode: 'sign' | 'optional' | 'view'; bytes?: number }[]
  conflicts: { kind: string; message: string; role?: string; orders?: number[]; proposed?: unknown; selected?: unknown }[]
  settingsTemplate: string
  settings: { expiryDays: number; reminders?: { afterDays: number; everyDays: number } | null; subject?: string; message?: string; allowPaper?: boolean; allowReassign?: boolean }
}
const emptyPerson = (): Person => ({ name: '', email: '', phone: '', accessCode: '' })
const identityLabel = (method: Identity) => method === 'identity' ? 'Identity document and selfie' : method === 'knowledge' ? 'Knowledge questions (US)' : method === 'voice' ? 'Voice-call code' : method === 'sms' ? 'SMS code' : method === 'email' ? 'Email code' : 'Link only'
function resolution(value: unknown): string {
  if (value === null) return 'None'
  if (typeof value === 'string') return ['email', 'link', 'sms', 'identity', 'knowledge', 'voice'].includes(value) ? identityLabel(value as Identity) : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object' && 'afterDays' in value && 'everyDays' in value) return `After ${value.afterDays}, then every ${value.everyDays} business days`
  return JSON.stringify(value) ?? ''
}

/** Combines the selected templates in their displayed order; the resulting draft still needs sending approval. */
export function TemplateComposition({ templates, onSent, onCancel }: { templates: Template[]; onSent: (id: string) => Promise<void>; onCancel: () => void }) {
  const combined=new Map<string,CustomEnvelopeField>();for(const f of templates.flatMap(t=>t.customFields??[])){const old=combined.get(f.name.toLowerCase());combined.set(f.name.toLowerCase(),{...f,required:f.required||Boolean(old?.required),value:old&&old.value!==f.value?'':f.value})}
  const [customFields,setCustomFields]=useState([...combined.values()])
  const [ordered, setOrdered] = useState(templates)
  const [choices, setChoices] = useState<Choices>({})
  const [preview, setPreview] = useState<{ key: string; data: Preview }>()
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [files, setFiles] = useState<{ key: string; file: File }[]>([])
  const [previewPending, setPreviewPending] = useState(true)
  const previewAction = useAction(), action = useAction()
  const submitting = useRef(false)
  const selectionKey = JSON.stringify(templates.map(t => t.id))
  const ids = ordered.map(t => t.id)
  const previewKey = JSON.stringify({ ids, choices })
  useEffect(() => { setOrdered(templates); setChoices({}); setPeople({}); setFiles([]) }, [selectionKey])
  useEffect(() => {
    let current = true
    setPreviewPending(true)
    void previewAction.run(async () => {
      try {
        const result = await request<Preview>('/api/inkwell/templates/compose-preview', JSON.parse(previewKey))
        if (!current) return
        setPeople(previous => Object.fromEntries(result.roles.map(role => [role.key, previous[role.key] ?? emptyPerson()])))
        setPreview({ key: previewKey, data: result })
      } catch (error) { if (current) throw error }
      finally { if (current) setPreviewPending(false) }
    })
    return () => { current = false }
  }, [previewKey])
  const current = preview?.key === previewKey ? preview.data : undefined
  const busy = action.busy || previewAction.busy || previewPending
  const documentCount = (current?.documents.length ?? 0) + files.length
  const recipientCount = current?.roles.reduce((n, role) => n + 1 + (role.witnesses?.maximum ?? 0), 0) ?? 0
  const fits = Boolean(current && !current.roles.some(r=>r.needsIdentityChoice) && documentCount <= 20 && recipientCount <= 100)
  function move(index: number, offset: number) {
    setOrdered(previous => { const next = [...previous]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next })
  }
  function changePerson(key: string, field: keyof Person, value: string) {
    setPeople(previous => ({ ...previous, [key]: { ...(previous[key] ?? emptyPerson()), [field]: value } }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || submitting.current || !current || !fits) return
    submitting.current = true
    try {
      await action.run(async () => {
        if (documentCount > 20 || recipientCount > 100) throw new Error('Use at most 20 documents and 100 recipients, including reserved witnesses.')
        const knownBytes = current.documents.reduce((n, d) => n + (d.bytes ?? 0), 0) + files.reduce((n, d) => n + d.file.size, 0)
        if (knownBytes > 100 * 1024 * 1024) throw new Error('The combined PDFs must fit within 100 MiB.')
        const documents = []
        for (const item of files) documents.push({ uploadId: await uploadDocument(item.file), mode: 'view' as const })
        const recipients = current.roles.map(role => {
          if(role.unresolvedIdentity)return {}
          const person = people[role.key] ?? emptyPerson()
          return { name: person.name, email: person.email, ...(['sms','voice'].includes(role.identity) ? { phone: person.phone } : {}), ...(role.accessCode ? { accessCode: person.accessCode } : {}) }
        })
        const { id } = await command<{ id: string }>('template.combine', { ids, choices, recipients, customFields, ...(documents.length ? { documents } : {}) })
        await onSent(id)
      })
    } finally { submitting.current = false }
  }
  return <section className="iw-panel iw-prepare iw-stack" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <div className="iw-section-head"><div><h1>Combine templates</h1><p>Choose the document order, check merged roles and resolve settings before preparing one envelope.</p></div><button type="button" disabled={action.busy} onClick={onCancel}>Cancel</button></div>
    <section className="iw-stack" aria-label="Selected templates"><h2>Template order</h2><ol className="iw-stack">{ordered.map((template, index) => <li key={template.id}><strong>{template.title}</strong><span className="iw-muted"> · version {template.version ?? 1}</span><div className="iw-actions"><button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${template.title} up`}>Move up</button><button type="button" disabled={busy || index === ordered.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${template.title} down`}>Move down</button></div></li>)}</ol></section>
    <label>Envelope settings from<select aria-label="Envelope settings from" disabled={busy} value={choices.settingsTemplate ?? ordered[0]?.id ?? ''} onChange={e => setChoices(previous => ({ ...previous, settingsTemplate: e.target.value }))}>{ordered.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>
    <ErrorNotice error={previewAction.error} />{previewPending && <p role="status">Updating composition preview…</p>}
    {current && <form className="iw-stack" onSubmit={submit}>
      <section className="iw-callout iw-stack" aria-label="Composition preview"><h2>Review the combination</h2><p>{documentCount} of 20 documents · {current.roles.length} roles · {recipientCount} of 100 recipient places including reserved witnesses</p><p>Settings from {current.templates.find(t => t.id === current.settingsTemplate)?.title}: expires after {current.settings.expiryDays} days; {current.settings.reminders ? `reminders after ${current.settings.reminders.afterDays}, then every ${current.settings.reminders.everyDays} business days` : 'no automatic reminders'}.</p>
        {current.conflicts.length > 0 ? <ul className="iw-stack" aria-label="Conflicts and resolutions">{current.conflicts.map((conflict, index) => <li key={index}><p>{conflict.message}</p>{conflict.proposed !== undefined && <p>Proposed: {resolution(conflict.proposed)}</p>}{conflict.selected !== undefined && <p>Selected: {conflict.kind === 'order' ? typeof conflict.selected === 'number' ? `Merge at routing order ${conflict.selected}` : 'Keep separate recipients' : resolution(conflict.selected)}</p>}{conflict.kind === 'order' && conflict.role && conflict.orders && <label>{conflict.role} routing conflict<select aria-label={`${conflict.role} routing conflict`} disabled={busy} value={typeof conflict.selected === 'number' ? conflict.selected : ''} onChange={event => {
          const label = conflict.role!, order = event.target.value === '' ? null : Number(event.target.value)
          setChoices(previous => ({ ...previous, orders: { ...previous.orders, [label]: order }, identity: Object.fromEntries(Object.entries(previous.identity ?? {}).filter(([key]) => !current.roles.some(role => role.role.trim() === label && role.key === key))) }))
        }}><option value="">Keep separate recipients</option>{conflict.orders.map(order => <option key={order} value={order}>Merge at routing order {order}</option>)}</select></label>}</li>)}</ul> : <p>No conflicting settings or role definitions.</p>}
        {current.settings.subject && <p>Invitation subject: {current.settings.subject}</p>}{current.settings.message && <p>Message to everyone: {current.settings.message}</p>}
      </section>
      <fieldset disabled={busy} className="iw-stack"><legend>Recipients</legend>{current.roles.map((role, index) => {
        if(role.unresolvedIdentity)return <div key={role.key}><h3>{role.role}</h3><p className="iw-muted">Routing order {role.order} · the granted earlier agent names this person. Email verification is required.</p></div>
        const person = people[role.key] ?? emptyPerson(), label = `${role.role}, routing order ${role.order}`
        return <div key={role.key} className="iw-stack"><h3>{role.role}</h3><p>Routing order {role.order}{role.action === 'approver' ? ' · approves without signing' : role.action === 'form_filler' ? ' · fills business fields' : ''}</p><p className="iw-muted">From {role.sources.map(source => current.templates[source.template]?.title).join(', ')}</p><div className="iw-two"><label>{label} name<input required maxLength={100} value={person.name} onChange={e => changePerson(role.key, 'name', e.target.value)} /></label><label>{label} email<input required type="email" maxLength={254} value={person.email} onChange={e => changePerson(role.key, 'email', e.target.value)} /></label></div>
          <label>{label} authentication<select aria-label={`${label} authentication`} value={role.needsIdentityChoice?'':role.identity} onChange={e => setChoices(previous => ({ ...previous, identity: { ...previous.identity, [role.key]: e.target.value as Identity } }))}><option value="" disabled>Choose authentication</option><option value="email">Email code</option><option value="link">Link only</option><option value="sms">SMS code</option><option value="identity">Identity document and selfie</option><option value="knowledge">Knowledge questions (US)</option><option value="voice">Voice-call code</option></select></label>
          {!role.needsIdentityChoice && ['sms','voice'].includes(role.identity) && <label>{label} {role.identity==='voice'?'phone':'mobile'} number<input required type="tel" autoComplete="tel" placeholder="+1 202 555 0146" value={person.phone} onChange={e => changePerson(role.key, 'phone', e.target.value)} /><small>Use a US {role.identity==='voice'?'phone':'mobile'} number with country code +1.</small></label>}
          {role.accessCode && <label>{label} access code<input required autoComplete="off" pattern="\S{4,32}" maxLength={32} title="4–32 characters, no spaces" value={person.accessCode} onChange={e => changePerson(role.key, 'accessCode', e.target.value)} /></label>}
          {role.witnesses && <p>{role.witnesses.minimum} witnesses required, up to {role.witnesses.maximum}; nominated by this signer.</p>}
          {role.messages.map((message, n) => <p key={`${index}-${n}`}>Private message from {current.templates[message.template]?.title}: {message.message}</p>)}
        </div>
      })}</fieldset>
      <section className="iw-stack" aria-label="Combined documents"><h2>Documents</h2><ol className="iw-stack">{current.documents.map((document, index) => <li key={index}>{document.filename} · {document.pages} page(s) · {document.mode === 'view' ? 'View only' : document.mode === 'optional' ? 'Optional to sign' : 'Required to sign'}</li>)}</ol>
        <label>Additional PDFs<input type="file" multiple accept="application/pdf,.pdf" disabled={busy || documentCount >= 20} onChange={e => {
          const selected = Array.from(e.target.files ?? []); e.target.value = ''
          action.setError('')
          if (selected.some(file => !file.name.toLowerCase().endsWith('.pdf'))) return action.setError('Choose PDF files.')
          if (documentCount + selected.length > 20) return action.setError('The combined envelope has room for at most 20 documents.')
          setFiles(previous => [...previous, ...selected.map(file => ({ key: crypto.randomUUID(), file }))])
        }} /></label>
        {files.length > 0 && <><p className="iw-muted">Additional PDFs are view only. You can edit the prepared draft to add fields.</p><ul className="iw-stack">{files.map(item => <li key={item.key}>{item.file.name} · View only <button type="button" disabled={busy} onClick={() => setFiles(previous => previous.filter(file => file.key !== item.key))} aria-label={`Remove ${item.file.name}`}>Remove</button></li>)}</ul></>}
      </section>
      {!fits && <p className="iw-error" role="alert">Resolve authentication choices and use at most 20 documents and 100 recipient places, including reserved witnesses.</p>}
      <CustomEnvelopeFields fields={customFields} onChange={setCustomFields} fixed/><ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button type="submit" className="iw-primary" disabled={busy || !fits}>{action.busy ? 'Preparing…' : 'Prepare combined envelope'}</button><p className="iw-muted">Review and approve the prepared draft before any invitations are sent.</p></div>
    </form>}
  </section>
}
