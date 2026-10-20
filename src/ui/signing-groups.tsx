// ROUTE-005: signing groups. Owners and admins keep named groups of 2-10 people in Settings; a sender picks a group
// instead of a person for a recipient or a template role, and any one member signs for it.
import { useEffect, useState, type FormEvent } from 'react'
import { command, request, type SigningGroup } from './types'
import { ErrorNotice, useAction } from './feedback'

/** The groups a sender may choose (owners, admins and senders read them with the workspace). */
export function useSigningGroups() {
  const [groups, setGroups] = useState<SigningGroup[]>([])
  useEffect(() => { void request<{ signingGroups?: SigningGroup[] }>('/api/inkwell').then(workspace => setGroups(workspace.signingGroups ?? []), () => setGroups([])) }, [])
  return groups
}

/** A choice between a person and a signing group for one recipient place. */
export function GroupChoice({ label, groups, value, disabled, onChange }: { label: string; groups: SigningGroup[]; value?: string; disabled?: boolean; onChange: (group: SigningGroup | undefined) => void }) {
  if (!groups.length && !value) return null
  return <label><span className="iw-sr">{label} signs as</span><select aria-label={`${label} signs as`} disabled={disabled} value={value ?? ''} onChange={event => onChange(groups.find(g => g.id === event.target.value))}><option value="">A person</option>{groups.map(g => <option key={g.id} value={g.id}>Group: {g.name}</option>)}{value && !groups.some(g => g.id === value) && <option value={value}>This saved group</option>}</select></label>
}
export const groupSummary = (group: { name: string; members: { name: string }[] }) => `${group.name} · any one of ${group.members.length} signs: ${group.members.map(m => m.name).join(', ')}`

type Member = { name: string; email: string }
const blank = (): Member[] => [{ name: '', email: '' }, { name: '', email: '' }]

export function SigningGroups({ groups, refresh }: { groups: SigningGroup[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<string>()
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Member[]>(blank())
  const action = useAction()
  const start = (group?: SigningGroup) => { setEditing(group?.id ?? 'new'); setName(group?.name ?? ''); setMembers(group ? group.members.map(({ name, email }) => ({ name, email })) : blank()) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action.run(async () => { await command('account.signing_group', { ...(editing && editing !== 'new' ? { id: editing } : {}), name, members }); setEditing(undefined); await refresh() })
  }
  const set = (index: number, key: keyof Member, value: string) => setMembers(current => current.map((m, i) => i === index ? { ...m, [key]: value } : m))
  return <section className="iw-panel iw-stack"><h2>Signing groups</h2>
    <p className="iw-muted">Send to a group instead of a person: every member gets their own link, and the first to sign signs for the group. Envelopes keep the members the group had when their draft was saved.</p>
    {groups.length ? <ul className="iw-stack">{groups.map(g => <li key={g.id} className="iw-stack"><div><strong>{g.name}</strong><small className="iw-muted"> · {g.members.map(m => `${m.name} <${m.email}>`).join(', ')}</small></div><div className="iw-actions"><button type="button" disabled={action.busy} aria-label={`Edit signing group ${g.name}`} onClick={() => start(g)}>Edit</button><button type="button" disabled={action.busy} aria-label={`Remove signing group ${g.name}`} onClick={() => void action.run(async () => { await command('account.signing_group', { id: g.id, remove: true }); await refresh() })}>Remove</button></div></li>)}</ul> : <p className="iw-muted">No signing groups yet.</p>}
    {editing ? <form onSubmit={submit} className="iw-stack"><fieldset disabled={action.busy} className="iw-stack"><legend>{editing === 'new' ? 'New signing group' : 'Edit signing group'}</legend>
      <label>Group name<input required maxLength={100} placeholder="Company Signers" value={name} onChange={event => setName(event.target.value)} /></label>
      {members.map((member, index) => <div key={index} className="iw-recipient"><label><span className="iw-sr">Member {index + 1} name</span><input aria-label={`Member ${index + 1} name`} required maxLength={100} placeholder="Full name" value={member.name} onChange={event => set(index, 'name', event.target.value)} /></label><label><span className="iw-sr">Member {index + 1} email</span><input aria-label={`Member ${index + 1} email`} required type="email" placeholder="Email" value={member.email} onChange={event => set(index, 'email', event.target.value)} /></label>{members.length > 2 && <button type="button" className="iw-text-button" aria-label={`Remove member ${index + 1}`} onClick={() => setMembers(current => current.filter((_, i) => i !== index))}>Remove</button>}</div>)}
      {members.length < 10 && <button type="button" className="iw-fit" onClick={() => setMembers(current => [...current, { name: '', email: '' }])}>Add member</button>}
      </fieldset><ErrorNotice error={action.error} /><div className="iw-actions"><button className="iw-primary" type="submit" disabled={action.busy}>Save group</button><button type="button" disabled={action.busy} onClick={() => setEditing(undefined)}>Cancel</button></div></form>
      : <><ErrorNotice error={action.error} /><button type="button" className="iw-fit" onClick={() => start()}>New signing group</button></>}
  </section>
}
