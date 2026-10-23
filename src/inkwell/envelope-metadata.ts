import { insist, object, text, type Actor, type Env } from './model'
import { searchEnvelopes } from './search'
export interface CustomEnvelopeField {name:string;value:string;required:boolean}
export function customEnvelopeFields(value:unknown,definitions:CustomEnvelopeField[]=[],allowBlank=false):CustomEnvelopeField[] {
 insist(value===undefined||Array.isArray(value)&&value.length<=20,'Add at most 20 custom envelope fields.')
 const fields=((value??definitions) as unknown[]).map(raw=>{const f=object(raw),name=text(f.name,'a custom field name',80);insist(!/[\r\n\t]/.test(name),'Custom field names use one line.');insist(f.required===undefined||typeof f.required==='boolean','Choose whether the custom field is required.');insist(f.value===undefined||typeof f.value==='string'&&f.value.length<=500,'Custom field values contain at most 500 characters.');return {name,value:typeof f.value==='string'?f.value.trim():'',required:f.required===true}})
 insist(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Custom field names must be unique.')
 for(const definition of definitions.filter(f=>f.required)){const field=fields.find(f=>f.name.toLowerCase()===definition.name.toLowerCase());insist(field,`Supply the required ${definition.name} custom field.`);field.required=true}
 for(const field of fields)insist(allowBlank||!field.required||field.value,`Supply the required ${field.name} custom field.`)
 return fields
}
export function envelopeTags(value:unknown):string[] {insist(value===undefined||Array.isArray(value)&&value.length<=10,'Add at most 10 tags.');return [...new Set(((value??[]) as unknown[]).map(tag=>text(tag,'a tag',40)))]}
export function mergeCustomFields(groups:CustomEnvelopeField[][]):CustomEnvelopeField[] {
 const merged=new Map<string,CustomEnvelopeField>()
 for(const field of groups.flat()){const key=field.name.toLowerCase(),before=merged.get(key);merged.set(key,{...field,required:field.required||Boolean(before?.required),value:before&&before.value!==field.value?'':field.value})}
 return [...merged.values()]
}
const csvCell=(value:string)=>{const safe=/^[=+\-@\t\r]/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"'}
export async function envelopeCsv(env:Env,actor:Actor,params:URLSearchParams) {
 const query=new URLSearchParams(params);query.delete('cursor');query.set('limit','100')
 const lines=[['id','title','status','folder_id','tags','custom_fields'].map(csvCell).join(',')]
 for(;;){const page=await searchEnvelopes(env,actor,query);for(const e of page.envelopes)lines.push([e.id,e.title,e.status,e.folderId??'',(e.tags??[]).join('; '),JSON.stringify(e.customFields??[])].map(csvCell).join(','));if(!page.next)break;query.set('cursor',page.next)}
 return lines.join('\r\n')+'\r\n'
}
