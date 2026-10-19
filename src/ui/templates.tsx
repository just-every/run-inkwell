import { useEffect, useState, type FormEvent } from 'react'
import { command, request, type Field } from './types'
import { ErrorNotice, useAction } from './feedback'
import { PrepareEnvelope } from './prepare-envelope'

// TMPL-001: the templates this person may use, a new one from the prepare screen, and a send that asks only for each
// role's person (and the access code a role needs); the new envelope opens for approval like any other draft.
type Role = { role: string; order: number; accessCode?: boolean; message?: string }
export type Template = { id: string; title: string; filename: string; roles: Role[]; fields: Field[]; expiryDays: number; reminders?: { afterDays: number; everyDays: number }; subject?: string; message?: string; allowPaper?: boolean; allowReassign?: boolean; version?: number }
type Person = { name: string; email: string; accessCode: string }

export function Templates({ onSent }: { onSent: (id: string) => Promise<void> }) {
  const [templates, setTemplates] = useState<Template[]>()
  const [creating, setCreating] = useState(false)
  // TMPL-003: a template being edited; saving it makes its next version.
  const [editing, setEditing] = useState<Template>()
  const [using, setUsing] = useState<Template>()
  const action = useAction()
  const load = async () => setTemplates((await request<{ templates: Template[] }>('/api/inkwell/templates')).templates)
  useEffect(() => { void action.run(load) }, [])
  if (creating || editing) return <PrepareEnvelope asTemplate template={editing} onCancel={() => { setCreating(false); setEditing(undefined) }} onSaved={async () => { setCreating(false); setEditing(undefined); await action.run(load) }} />
  if (using) return <SendFromTemplate template={using} onCancel={() => setUsing(undefined)} onSent={onSent} />
  return <section className="iw-panel iw-stack">
    <div className="iw-section-head"><div><h2>Your templates</h2><p className="iw-muted">A template keeps the PDF, roles, fields, messages, reminders and expiry. Sending asks only who fills each role.</p></div><button className="iw-primary iw-fit" type="button" onClick={() => setCreating(true)}>New template</button></div>
    <ErrorNotice error={action.error} />
    {templates && (templates.length === 0 ? <p className="iw-muted">No templates yet.</p> : <ul className="iw-contact-results" aria-label="Templates">{templates.map(template => <li key={template.id}><span><strong>{template.title}</strong><small className="iw-muted">Version {template.version ?? 1} · {template.roles.map(r => `${r.order}. ${r.role}`).join(' · ')} · {template.fields.length} fields · expires after {template.expiryDays} days{template.reminders ? ` · reminders after ${template.reminders.afterDays}, then every ${template.reminders.everyDays} business days` : ''}</small></span><span className="iw-actions"><button type="button" className="iw-primary" aria-label={`Use ${template.title}`} onClick={() => setUsing(template)}>Use</button><button type="button" aria-label={`Edit ${template.title}`} onClick={() => setEditing(template)}>Edit</button><button type="button" disabled={action.busy} aria-label={`Delete ${template.title}`} onClick={() => void action.run(async () => { await command('template.remove', { id: template.id }); await load() })}>Delete</button></span></li>)}</ul>)}
  </section>
}

function SendFromTemplate({ template, onCancel, onSent }: { template: Template; onCancel: () => void; onSent: (id: string) => Promise<void> }) {
  const [people, setPeople] = useState<Person[]>(template.roles.map(() => ({ name: '', email: '', accessCode: '' })))
  const action = useAction()
  const set = (index: number, key: keyof Person, value: string) => setPeople(current => current.map((person, i) => i === index ? { ...person, [key]: value } : person))
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      const { id } = await command<{ id: string }>('template.use', { id: template.id, recipients: people.map(({ accessCode, ...person }, i) => ({ ...person, ...(template.roles[i].accessCode ? { accessCode } : {}) })) })
      await onSent(id)
    })
  }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>Send {template.title}</h1><p>Name who fills each role. Fields, routing, messages, reminders and expiry come from the template.</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <fieldset disabled={action.busy}><legend>Roles <span>· in routing order</span></legend><div className="iw-stack">{template.roles.map((role, index) => <div key={index} className="iw-recipient"><span className="iw-order" aria-hidden="true">{role.order}</span><label><span className="iw-sr">{role.role} name</span><input aria-label={`${role.role} name`} placeholder={`${role.role}: full name`} required maxLength={100} value={people[index].name} onChange={event => set(index, 'name', event.target.value)} /></label><label><span className="iw-sr">{role.role} email</span><input aria-label={`${role.role} email`} placeholder="Email" type="email" required value={people[index].email} onChange={event => set(index, 'email', event.target.value)} /></label>{role.accessCode && <label><span className="iw-sr">{role.role} access code</span><input aria-label={`${role.role} access code`} placeholder="Access code" required autoComplete="off" pattern="\S{4,32}" title="4–32 characters, no spaces" maxLength={32} value={people[index].accessCode} onChange={event => set(index, 'accessCode', event.target.value)} /></label>}</div>)}</div></fieldset>
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy} type="submit">{action.busy ? 'Preparing…' : 'Prepare to send'}</button><p className="iw-muted">You approve it next, as with any envelope.</p></div>
    </form>
  </section>
}
