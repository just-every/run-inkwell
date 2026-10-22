import { useEffect, useState } from 'react'
import type { Field } from './types'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'
import { SigningFieldInput } from './signing-field-input'
import { requiredField } from '../inkwell/field-rules'
import { readingOrder } from './signing-guide'

export function RecipientAction({ role, base, fields, shown, values, displayed, onChange, onComplete, disabled, fieldError }: {
  role: 'approver'|'form_filler'; base: string; fields: Field[]; shown: Field[]; values: Record<string,string>; displayed: Record<string,string>; onChange: (id:string,value:string)=>void; onComplete:()=>Promise<void>; disabled:boolean; fieldError:string
}) {
  const action=useAction(),[consent,setConsent]=useState(false)
  const approving=role==='approver'
  useEffect(()=>{setConsent(false)},[base,role])
  return <form className="iw-sign-fields iw-stack" onSubmit={e=>{e.preventDefault();if(disabled||action.busy)return;void action.run(async()=>{await request(`${base}/${approving?'approve':'fill'}`,{...(approving?{}:{values}),consent,commandId:crypto.randomUUID()});await onComplete()})}}>
    <h2>{approving?'Your approval':'Your fields'}</h2>
    {!approving&&readingOrder(shown).map(field=><SigningFieldInput key={field.id} field={field} required={requiredField(field,fields,values)} values={displayed} disabled={disabled||action.busy} onChange={onChange}/>)}
    <ErrorNotice error={fieldError}/><label className="iw-check"><input id="iw-consent" type="checkbox" required checked={consent} disabled={disabled||action.busy} onChange={e=>setConsent(e.target.checked)}/>{approving?'I have reviewed these documents and approve them.':'I have reviewed my entries and confirm that these fields are complete.'}</label>
    <button className="iw-primary" disabled={disabled||action.busy||!consent||Boolean(fieldError)}>{action.busy?'Recording…':approving?'Approve documents':'Complete fields'}</button><ErrorNotice error={action.error}/>
  </form>
}
