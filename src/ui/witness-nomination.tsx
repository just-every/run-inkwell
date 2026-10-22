import { useEffect, useState } from 'react'
import type { WitnessConfig } from './types'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'

export type WitnessView = Omit<WitnessConfig, 'minimum' | 'maximum'> & { minimum: number; maximum: number } & { nominees: { name: string; email: string }[]; returnRequired: boolean }
export function WitnessNomination({ witnesses, base, disabled, onSaved, onDirtyChange }: { witnesses: WitnessView; base: string; disabled: boolean; onSaved: () => Promise<void>; onDirtyChange?: (dirty: boolean) => void }) {
  const [nominees,setNominees]=useState(witnesses.nominees ?? witnesses.named ?? [])
  const action=useAction()
  const savedNominees = witnesses.nominees ?? (witnesses.returnRequired ? [] : witnesses.named ?? [])
  const snapshot = JSON.stringify(savedNominees)
  const dirty = JSON.stringify(nominees) !== snapshot
  const [saved,setSaved] = useState(false)
  useEffect(()=>{setNominees(JSON.parse(snapshot));setSaved(false)},[base,snapshot,witnesses.returnRequired])
  useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false)},[dirty,onDirtyChange])
  return <form className="iw-callout iw-stack" onSubmit={e=>{e.preventDefault();if(disabled||action.busy)return;void action.run(async()=>{await request(`${base}/witnesses`,{nominees,commandId:crypto.randomUUID()});await onSaved();setSaved(true)})}}>
    <h2>{witnesses.returnRequired?'Nominate a replacement witness':'Your witnesses'}</h2>
    <p>{witnesses.returnRequired?'A witness declined. Nominate another person so this step can continue.':'Choose witnesses by name and email. They are invited after you sign; later recipients wait for them.'} {witnesses.minimum} required, up to {witnesses.maximum} allowed. A witness must use a different email from every other recipient.</p>
    {nominees.map((person,i)=><div className="iw-stack" key={i}><label>Witness {i+1} name<input required maxLength={100} disabled={disabled||action.busy} value={person.name} onChange={e=>setNominees(current=>current.map((p,n)=>n===i?{...p,name:e.target.value}:p))}/></label><label>Witness {i+1} email<input required type="email" maxLength={254} disabled={disabled||action.busy} value={person.email} onChange={e=>setNominees(current=>current.map((p,n)=>n===i?{...p,email:e.target.value}:p))}/></label><button type="button" className="iw-fit" disabled={disabled||action.busy} onClick={()=>setNominees(current=>current.filter((_,n)=>n!==i))}>Remove witness {i+1}</button></div>)}
    {nominees.length<witnesses.maximum&&<button type="button" className="iw-fit" disabled={disabled||action.busy} onClick={()=>setNominees(current=>[...current,{name:'',email:''}])}>Add witness</button>}
    <button className="iw-primary iw-fit" disabled={disabled||action.busy||nominees.length<witnesses.minimum||nominees.length>witnesses.maximum}>{action.busy?'Saving…':'Save witnesses'}</button><ErrorNotice error={action.error}/>{dirty && <p role="status">Save your witness changes before signing.</p>}{saved && !dirty && <p role="status">Witness nominations saved.</p>}
  </form>
}
