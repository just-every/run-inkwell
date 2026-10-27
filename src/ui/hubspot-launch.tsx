import { useState } from 'react'
import { request } from './types'
import { ErrorNotice, useAction } from './feedback'
type Mapping={field:string;object:'deals'|'contacts';property:string;readOnly:boolean}
export function HubspotLaunch({configured,templates,onPrepared}:{configured:boolean;templates:{id:string;title:string}[];onPrepared:(id:string)=>Promise<void>}) {
 const [recordType,setRecordType]=useState<'deals'|'contacts'>('deals'),[recordId,setRecordId]=useState(''),[templateId,setTemplateId]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState(''),[consent,setConsent]=useState(false),[send,setSend]=useState(false),[mappings,setMappings]=useState<Mapping[]>([])
 const action=useAction()
 return <section className="iw-stack" aria-label="Prepare from HubSpot">
  <h3>Prepare from a CRM record</h3><p>Choose the exact record and template. Imported fields record their native source. Follow-up always needs a separate per-envelope grant; a CRM owner receives no new document access.</p><ErrorNotice error={action.error}/>
  <form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{const result=await request<{id:string}>('/api/inkwell/hubspot/prepare',{commandId:crypto.randomUUID(),consent,recordType,recordId,templateId,recipients:email?[{name,email}]:undefined,mappings,send});await onPrepared(result.id)})}}>
   <label>CRM record type<select value={recordType} onChange={e=>{setRecordType(e.target.value as typeof recordType);setConsent(false)}}><option value="deals">Deal</option><option value="contacts">Contact</option></select></label>
   <label>CRM record ID<input required value={recordId} onChange={e=>{setRecordId(e.target.value);setConsent(false)}} maxLength={100}/></label>
   <label>CRM agreement template<select required value={templateId} onChange={e=>{setTemplateId(e.target.value);setConsent(false)}}><option value="">Choose a template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
   <label>CRM recipient name<input value={name} onChange={e=>{setName(e.target.value);setConsent(false)}} required={recordType==='deals'} maxLength={200}/></label>
   <label>CRM recipient email<input type="email" value={email} onChange={e=>{setEmail(e.target.value);setConsent(false)}} required={recordType==='deals'} maxLength={254}/></label>
   <p>For a contact, leave the recipient blank to use the contact’s native name and email. Choose a template with one recipient role.</p>
   {mappings.map((mapping,index)=><fieldset key={index} className="iw-stack"><legend>CRM field mapping {index+1}</legend><label>Template field ID<input required value={mapping.field} onChange={e=>setMappings(v=>v.map((m,i)=>i===index?{...m,field:e.target.value}:m))}/></label><label>HubSpot property<input required value={mapping.property} onChange={e=>setMappings(v=>v.map((m,i)=>i===index?{...m,property:e.target.value}:m))}/></label><label className="iw-check"><input type="checkbox" checked={mapping.readOnly} onChange={e=>setMappings(v=>v.map((m,i)=>i===index?{...m,readOnly:e.target.checked}:m))}/>Read-only value</label><button type="button" onClick={()=>setMappings(v=>v.filter((_,i)=>i!==index))}>Remove mapping {index+1}</button></fieldset>)}
   <button className="iw-fit" type="button" onClick={()=>setMappings(v=>[...v,{field:'',object:recordType,property:'',readOnly:true}])}>Add CRM field mapping</button>
   <label className="iw-check"><input type="checkbox" checked={send} onChange={e=>{setSend(e.target.checked);setConsent(false)}}/>Send under the integration sending policy after preparation</label>
   <label className="iw-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>I authorize Inkwell to read these selected HubSpot records, merge the listed properties into this template, and write completion status, executed key fields, custom metadata and one private executed PDF with one timeline note back to this record. This grants no additional envelope access, sending consent or follow-up authority.</label>
   <button className="iw-fit" disabled={action.busy||!configured||!templateId||!consent}>{send?'Prepare and request integration send':'Prepare CRM draft'}</button>
  </form>
 </section>
}
