import { TemplateMaintenance } from './template-maintenance'
import { useEffect, useState, type FormEvent } from 'react'
import { command, request, type ApprovalRule, type Field, type SigningGroup } from './types'
import { GroupChoice, groupSummary, useSigningGroups } from './signing-groups'
import type { RoutingRule } from '../inkwell/model'
import { RoutingPreview } from './routing-rules'
import { ErrorNotice, useAction } from './feedback'
import { PrepareEnvelope } from './prepare-envelope'
import { SharePanel, type TemplateFolder, type TemplateShare } from './template-sharing'

// TMPL-001: the templates this person may use, a new one from the prepare screen, and a send that asks only for each
// role's person (and the access code a role needs); the new envelope opens for approval like any other draft.
type Role = { action?: 'signer' | 'approver' | 'form_filler'; witnesses?: import('../inkwell/model').WitnessRule; includeWhen?: RoutingRule; role: string; order: number; accessCode?: boolean; linkOnly?: boolean; message?: string }
export type Template = { documents?: import('../inkwell/documents').EnvelopeDocument[]; maintenanceAvailable?: boolean; approval?: ApprovalRule; id: string; title: string; filename: string; roles: Role[]; fields: Field[]; expiryDays: number; reminders?: { afterDays: number; everyDays: number }; subject?: string; message?: string; allowPaper?: boolean; allowReassign?: boolean; version?: number; tags?: string[]; access?: 'use' | 'edit' | 'manage'; folder?: { id: string; name: string } | null; shares?: TemplateShare[] }
type Person = { name: string; email: string; accessCode: string }

export function Templates({ onSent }: { onSent: (id: string) => Promise<void> }) {
  const [templates, setTemplates] = useState<Template[]>()
  // TMPL-002: the folders this person reaches, the search by name or tag, the folder shown and the sharing panel open.
  const [folders, setFolders] = useState<TemplateFolder[]>([])
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [sharing, setSharing] = useState<string>()
  const [creating, setCreating] = useState(false)
  // TMPL-003: a template being edited; saving it makes its next version.
  const [editing, setEditing] = useState<Template>()
  const [using, setUsing] = useState<Template>()
  const action = useAction()
  const load = async (q = query, f = folder) => { const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(f ? { folder: f } : {}) }), result = await request<{ templates: Template[]; folders: TemplateFolder[] }>(`/api/inkwell/templates?${params}`); setTemplates(result.templates); setFolders(result.folders) }
  useEffect(() => { void action.run(load) }, [])
  const shownFolder = folders.find(f => f.id === folder)
  if (creating || editing) return <PrepareEnvelope asTemplate template={editing} folders={folders.filter(f => f.access !== 'use')} defaultFolder={shownFolder && shownFolder.access !== 'use' ? shownFolder.id : ''} onCancel={() => { setCreating(false); setEditing(undefined) }} onSaved={async () => { await load(); setCreating(false); setEditing(undefined) }} />
  if (using) return <SendFromTemplate template={using} onCancel={() => setUsing(undefined)} onSent={onSent} />
  return <section className="iw-panel iw-stack">
    <div className="iw-section-head"><div><h2>Your templates</h2><p className="iw-muted">A template keeps the PDF, roles, fields, messages, reminders and expiry. Sending asks only who fills each role.</p></div><button className="iw-primary iw-fit" type="button" onClick={() => setCreating(true)}>New template</button></div>
    <div className="iw-actions"><label>Search templates<input type="search" placeholder="Name or tag" value={query} onChange={event => { setQuery(event.target.value); void action.run(() => load(event.target.value)) }} /></label><label>Folder<select aria-label="Folder" value={folder} onChange={event => { setFolder(event.target.value); setSharing(undefined); void action.run(() => load(query, event.target.value)) }}><option value="">All folders</option><option value="personal">My templates</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <form className="iw-actions" onSubmit={event => { event.preventDefault(); void action.run(async () => { const { id } = await command<{ id: string }>('template.folder_create', { name: folderName }); setFolderName(''); setFolder(id); await load(query, id) }) }}><label>New folder name<input required maxLength={80} value={folderName} onChange={event => setFolderName(event.target.value)} /></label><button type="submit" disabled={action.busy}>Create folder</button></form></div>
    {shownFolder?.access === 'manage' && <SharePanel subject={{ folderId: shownFolder.id }} label={`the folder ${shownFolder.name}`} shares={shownFolder.shares ?? []} onChanged={() => load()} />}
    <ErrorNotice error={action.error} />
    {templates && (templates.length === 0 ? <p className="iw-muted">{query.trim() || folder ? 'No templates match.' : 'No templates yet.'}</p> : <ul className="iw-contact-results" aria-label="Templates">{templates.map(template => <li key={template.id} style={{ flexWrap: 'wrap' }}><span><strong>{template.title}</strong><small className="iw-muted">{template.folder ? template.folder.name : 'My templates'}{template.tags?.length ? ` · tags ${template.tags.join(', ')}` : ''}{template.access && template.access !== 'manage' ? ` · shared with you to ${template.access}` : ''}</small><small className="iw-muted">Version {template.version ?? 1} · {template.roles.map(r => `${r.order}. ${r.role}`).join(' · ')} · {template.fields.length} fields · expires after {template.expiryDays} days{template.reminders ? ` · reminders after ${template.reminders.afterDays}, then every ${template.reminders.everyDays} business days` : ''}</small></span><span className="iw-actions"><button type="button" className="iw-primary" aria-label={`Use ${template.title}`} onClick={() => setUsing(template)}>Use</button>{template.access !== 'use' && <button type="button" aria-label={`Edit ${template.title}`} onClick={() => setEditing(template)}>Edit</button>}{template.access === 'manage' && <><button type="button" aria-expanded={sharing === template.id} aria-label={`Share ${template.title}`} onClick={() => setSharing(sharing === template.id ? undefined : template.id)}>Share</button><button type="button" disabled={action.busy} aria-label={`Delete ${template.title}`} onClick={() => void action.run(async () => { await command('template.remove', { id: template.id }); await load() })}>Delete</button></>}</span>{template.maintenanceAvailable && <TemplateMaintenance templateId={template.id} onPublished={() => load()} />}{sharing === template.id && <SharePanel subject={{ id: template.id }} label={template.title} shares={template.shares ?? []} onChanged={() => load()} />}</li>)}</ul>)}
  </section>
}

function SendFromTemplate({ template, onCancel, onSent }: { template: Template; onCancel: () => void; onSent: (id: string) => Promise<void> }) {
  const [people, setPeople] = useState<Person[]>(template.roles.map(() => ({ name: '', email: '', accessCode: '' })))
  const action = useAction()
  // ROUTE-005: a role may be filled by a signing group instead of a person.
  const groups = useSigningGroups(), [chosen, setChosen] = useState<(SigningGroup | undefined)[]>(template.roles.map(() => undefined))
  const set = (index: number, key: keyof Person, value: string) => setPeople(current => current.map((person, i) => i === index ? { ...person, [key]: value } : person))
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => {
      const { id } = await command<{ id: string }>('template.use', { id: template.id, recipients: people.map(({ accessCode, ...person }, i) => chosen[i] ? { group: chosen[i]!.id } : ({ ...person, ...(template.roles[i].accessCode ? { accessCode } : {}) })) })
      await onSent(id)
    })
  }
  return <section className="iw-panel iw-prepare"><div className="iw-section-head"><div><h1>Send {template.title}</h1><p>Name who fills each role. Fields, routing, messages, reminders and expiry come from the template.</p></div><button type="button" onClick={onCancel} disabled={action.busy}>Cancel</button></div>
    <form onSubmit={submit} className="iw-stack">
      <fieldset disabled={action.busy}><legend>Roles <span>· in routing order</span></legend><div className="iw-stack">{template.roles.map((role, index) => <div key={index} className="iw-recipient"><span className="iw-order" aria-hidden="true">{role.order}</span>{!role.accessCode && !role.witnesses && (!role.action || role.action === 'signer') && <GroupChoice label={role.role} groups={groups} value={chosen[index]?.id} onChange={group => setChosen(current => current.map((g, k) => k === index ? group : g))} />}{chosen[index] ? <span className="iw-muted">{groupSummary(chosen[index]!)}</span> : <><label><span className="iw-sr">{role.role} name</span><input aria-label={`${role.role} name`} placeholder={`${role.role}: full name`} required maxLength={100} value={people[index].name} onChange={event => set(index, 'name', event.target.value)} /></label><label><span className="iw-sr">{role.role} email</span><input aria-label={`${role.role} email`} placeholder="Email" type="email" required value={people[index].email} onChange={event => set(index, 'email', event.target.value)} /></label></>}{role.accessCode && <label><span className="iw-sr">{role.role} access code</span><input aria-label={`${role.role} access code`} placeholder="Access code" required autoComplete="off" pattern="\S{4,32}" title="4–32 characters, no spaces" maxLength={32} value={people[index].accessCode} onChange={event => set(index, 'accessCode', event.target.value)} /></label>}</div>)}</div></fieldset>
      <RoutingPreview signers={template.roles.map((role, index) => ({ ...role, role: role.action ?? 'signer', name: chosen[index]?.name || people[index].name || role.role }))} fields={template.fields} />
      <ErrorNotice error={action.error} /><div className="iw-actions iw-submit"><button className="iw-primary" disabled={action.busy} type="submit">{action.busy ? 'Preparing…' : 'Prepare to send'}</button><p className="iw-muted">You approve it next, as with any envelope.</p></div>
    </form>
  </section>
}
