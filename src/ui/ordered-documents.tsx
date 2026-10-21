import { useState } from 'react'
import type { EnvelopeDocument } from '../inkwell/documents'
import { request } from './types'
export type DocumentFile={key:string;file:File;mode:EnvelopeDocument['mode'];pages:number}
export async function uploadDocument(file:File) {
 const upload=await request<{id:string;chunkBytes:number}>('/api/inkwell/documents/uploads',{filename:file.name,bytes:file.size})
 for(let offset=0,part=0;offset<file.size;offset+=upload.chunkBytes,part++){
  const response=await fetch(`/api/inkwell/documents/uploads/${upload.id}/parts/${part}`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:file.slice(offset,offset+upload.chunkBytes)})
  if(!response.ok)throw new Error('Document upload interrupted. Save again to retry.')
 }
 return upload.id
}
export function OrderedDocuments({documents,busy,onChange,onAdd}:{documents:DocumentFile[];busy:boolean;onChange:(docs:DocumentFile[])=>void;onAdd:(file:File)=>void}) {
 const [uploadFocused,setUploadFocused]=useState(false)
 return <section className="iw-stack" aria-label="Envelope documents"><h2>Documents in this envelope</h2><p>Up to 20 PDFs, 100 MiB in total. Everyone signs required documents in one session; view-only documents have no fields.</p><ol className="iw-stack">{documents.map((d,i)=><li className="iw-stack" key={d.key}><strong>{d.file.name}</strong><label>Document {i+1} signing requirement<select aria-label={`Document ${i+1} signing requirement`} disabled={busy} value={d.mode} onChange={e=>onChange(documents.map((v,k)=>k===i?{...v,mode:e.target.value as DocumentFile['mode']}:v))}><option value="sign">Required to sign</option><option value="optional">Optional to sign</option><option value="view">View only</option></select></label><div className="iw-actions"><button type="button" disabled={busy||i===0} onClick={()=>{const next=[...documents];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(next)}}>Move {d.file.name} up</button><button type="button" disabled={busy||i===documents.length-1} onClick={()=>{const next=[...documents];[next[i+1],next[i]]=[next[i],next[i+1]];onChange(next)}}>Move {d.file.name} down</button><button type="button" disabled={busy||documents.length===1} onClick={()=>onChange(documents.filter((_,k)=>k!==i))}>Remove {d.file.name}</button></div></li>)}</ol><label>Additional PDF<input type="file" accept="application/pdf,.pdf" onFocus={()=>setUploadFocused(true)} onBlur={()=>setUploadFocused(false)} style={uploadFocused?{outline:'2px solid var(--rer-focus)',outlineOffset:2}:undefined} disabled={busy||documents.length>=20} onChange={e=>{const file=e.target.files?.[0];if(file)onAdd(file);e.target.value=''}}/></label></section>
}
