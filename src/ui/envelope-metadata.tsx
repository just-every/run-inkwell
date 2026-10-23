import type { CustomEnvelopeField } from '../inkwell/envelope-metadata'
export function CustomEnvelopeFields({fields,onChange,definitions=false,fixed=false}:{fields:CustomEnvelopeField[];onChange:(fields:CustomEnvelopeField[])=>void;definitions?:boolean;fixed?:boolean}) {
 const set=(index:number,patch:Partial<CustomEnvelopeField>)=>onChange(fields.map((field,i)=>i===index?{...field,...patch}:field))
 return <fieldset className="iw-stack"><legend>Custom envelope fields</legend><p>Business metadata for search and exports. These values do not change the signed document.</p>
 {fields.map((field,i)=><div className="iw-stack iw-callout" key={i}>
 {fixed?<strong>{field.name}{field.required?' (required)':''}</strong>:<label>Custom field {i+1} name<input required maxLength={80} value={field.name} onChange={e=>set(i,{name:e.target.value})}/></label>}
 <label>{fixed?field.name:`Custom field ${i+1} value`}<input required={!definitions&&field.required} maxLength={500} value={field.value} onChange={e=>set(i,{value:e.target.value})}/></label>
 {!fixed&&<><label className="iw-check"><input type="checkbox" checked={field.required} onChange={e=>set(i,{required:e.target.checked})}/>Required before preparing an envelope</label><button className="iw-fit" type="button" onClick={()=>onChange(fields.filter((_,index)=>index!==i))}>Remove custom field</button></>}
 </div>)}
 {!fixed&&<button className="iw-fit" type="button" disabled={fields.length>=20} onClick={()=>onChange([...fields,{name:'',value:'',required:false}])}>Add custom field</button>}
 </fieldset>
}
