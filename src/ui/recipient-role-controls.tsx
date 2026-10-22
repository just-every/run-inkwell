import type { RecipientRole, WitnessConfig } from './types'

export function RecipientRoleControls({ index, role, witnesses, disabled, remaining, onChange }: {
  index: number; role: RecipientRole; witnesses?: WitnessConfig; disabled: boolean; remaining: number
  onChange: (role: RecipientRole, witnesses?: WitnessConfig) => void
}) {
  const label = `Recipient ${index + 1}`
  return <div className="iw-stack" style={{ gridColumn: '1 / -1' }}>
    <label>{label} action<select aria-label={`${label} action`} value={role} disabled={disabled || role === 'witness'} onChange={e => onChange(e.target.value as RecipientRole, e.target.value === 'signer' ? witnesses : undefined)}>
      <option value="signer">Sign</option><option value="approver">Approve without signing</option><option value="form_filler">Fill in fields</option><option value="specify_recipients">Name later recipients</option><option value="editor">Edit later recipients</option><option value="needs_to_view">Must open documents</option><option value="certified_delivery">Certified delivery</option>{role === 'witness' && <option value="witness">Witness</option>}
    </select></label>
    {role === 'approver' && <p className="iw-muted">This recipient approves the documents without completing fields or signing.</p>}
    {role === 'form_filler' && <p className="iw-muted">Place business fields for this recipient; omit signature, initials and stamp fields.</p>}
    {role === 'signer' && <fieldset disabled={disabled}><legend>Witnesses for {label.toLowerCase()}</legend><div className="iw-stack">
      <label>Witness requirement<select aria-label={`${label} witness requirement`} value={witnesses ? `${witnesses.minimum}:${witnesses.maximum}` : ''} onChange={e => {
        if (!e.target.value) return onChange(role)
        const [minimum,maximum] = e.target.value.split(':').map(Number)
        onChange(role, { ...witnesses, minimum: minimum as 0|1|2, maximum: maximum as 1|2, ...(witnesses?.named ? {named:witnesses.named.slice(0,maximum)} : {}) })
      }}><option value="">No witnesses</option>{[[0,1,'Allow one'],[1,1,'Require one'],[0,2,'Allow up to two'],[1,2,'Require one, allow two'],[2,2,'Require two']].map(([minimum, maximum, title]) => <option key={`${minimum}:${maximum}`} value={`${minimum}:${maximum}`} disabled={Number(maximum)>remaining}>{title}</option>)}</select></label>
      {witnesses && <><label>Witness authentication<select aria-label={`${label} witness authentication`} value={witnesses.linkOnly ? 'link' : 'email'} onChange={e => onChange(role,{...witnesses,linkOnly:e.target.value==='link'})}><option value="email">Email code</option><option value="link">Link only</option></select></label>
        <label className="iw-check"><input type="checkbox" checked={Boolean(witnesses.address)} onChange={e => onChange(role,{...witnesses,address:e.target.checked})}/>Collect witness address</label>
        {(witnesses.named ?? []).map((person,i)=><div className="iw-two" key={i}><label>Named witness {i+1} name<input required maxLength={100} value={person.name} onChange={e=>onChange(role,{...witnesses,named:witnesses.named!.map((p,n)=>n===i?{...p,name:e.target.value}:p)})}/></label><label>Named witness {i+1} email<input required type="email" maxLength={254} value={person.email} onChange={e=>onChange(role,{...witnesses,named:witnesses.named!.map((p,n)=>n===i?{...p,email:e.target.value}:p)})}/></label><button type="button" onClick={()=>onChange(role,{...witnesses,named:witnesses.named!.filter((_,n)=>n!==i)})}>Remove named witness {i+1}</button></div>)}
        {(witnesses.named?.length ?? 0)<witnesses.maximum && <button type="button" className="iw-fit" onClick={()=>onChange(role,{...witnesses,named:[...(witnesses.named??[]),{name:'',email:''}]})}>Name a witness in advance</button>}
        <p className="iw-muted">The signer confirms their witnesses while signing. Witnesses are invited after that signature, before the next routing order.</p>
      </>}
    </div></fieldset>}
    {disabled && <p className="iw-muted">Recipient actions and witness requirements stay fixed after sending.</p>}
  </div>
}
