import { useEffect, useState } from 'react'
import { command, request, type Actor, type Envelope } from './types'
import { ErrorNotice, useAction } from './feedback'
export interface EnvelopeFolder {id:string;name:string;version:number;retentionYears:number|null;manage:boolean;access:string;shares:{operatorId:string;email:string;access:string}[]}
export function EnvelopeFolders({actor,folders,selected,onSelect,refresh}:{actor:Actor;folders:EnvelopeFolder[];selected:string;onSelect:(id:string)=>void;refresh:()=>Promise<void>}) {
 const [name,setName]=useState(''),action=useAction()
 return <details className="iw-card iw-stack"><summary>Folders</summary>
 <label>Envelope folder<select aria-label="Envelope folder" value={selected} onChange={e=>onSelect(e.target.value)}><option value="">All folders</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
 {actor.role!=='viewer'&&<form className="iw-stack" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await command('folder.change',{action:'create',name});setName('');await refresh()})}}><label>New envelope folder<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} /></label><button className="iw-fit" disabled={action.busy}>Create envelope folder</button></form>}
 {folders.filter(f=>f.manage).map(f=><FolderSettings key={f.id} folder={f} actor={actor} refresh={refresh}/>)}<ErrorNotice error={action.error}/></details>
}
function FolderSettings({folder,actor,refresh}:{folder:EnvelopeFolder;actor:Actor;refresh:()=>Promise<void>}) {
 const [email,setEmail]=useState(''),[access,setAccess]=useState('view'),[years,setYears]=useState(folder.retentionYears?.toString()??''),action=useAction()
 const save=(input:Record<string,unknown>)=>action.run(async()=>{await command('folder.change',{id:folder.id,expectedVersion:folder.version,...input});await refresh()})
 return <details className="iw-stack"><summary>{folder.name} settings</summary>
 <p>{folder.retentionYears?`${folder.retentionYears}-year folder retention`:'Inherits account retention'}. Owners and admins receive a 30-day warning before purge. Legal holds prevent erasure.</p>
 {['owner','admin'].includes(actor.role)&&<form className="iw-stack" onSubmit={e=>{e.preventDefault();void save({action:'retention',years:years===''?null:Number(years)})}}><label>Folder retention years<input type="number" min={1} max={99} step={1} value={years} onChange={e=>setYears(e.target.value)} /></label><p>Leave empty to inherit the account rule. A folder rule replaces it.</p><button className="iw-fit" disabled={action.busy}>Save folder retention</button></form>}
 <form className="iw-stack" onSubmit={e=>{e.preventDefault();void save({action:'share',email,access})}}><label>Share folder with email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Folder access<select aria-label="Folder access" value={access} onChange={e=>setAccess(e.target.value)}><option value="view">View</option><option value="edit">Edit envelopes</option></select></label><p>Editors cannot share again or move envelopes. Viewer roles stay read-only.</p><button className="iw-fit" disabled={action.busy}>Share folder</button></form>
 <ul>{folder.shares.map(s=><li key={s.operatorId}>{s.email} · {s.access} <button disabled={action.busy} onClick={()=>void save({action:'unshare',email:s.email})}>Remove share</button></li>)}</ul><ErrorNotice error={action.error}/></details>
}
export function EnvelopeFiling({envelope,refresh}:{envelope:Envelope;refresh:()=>Promise<void>}) {
 const [folders,setFolders]=useState<EnvelopeFolder[]>([]),[folderId,setFolderId]=useState(envelope.folderId??''),action=useAction()
 useEffect(()=>{void action.run(async()=>setFolders((await request<{folders:EnvelopeFolder[]}>('/api/inkwell/folders')).folders))},[])
 useEffect(()=>setFolderId(envelope.folderId??''),[envelope.folderId])
 return <form className="iw-stack iw-quiet" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await command('envelope.folder',{id:envelope.id,expectedVersion:envelope.version,folderId:folderId||null});await refresh()})}}><h3>File envelope</h3><label>Move to folder<select aria-label="Move to folder" value={folderId} onChange={e=>setFolderId(e.target.value)}><option value="">No folder</option>{folders.filter(f=>f.manage||f.id===envelope.folderId).map(f=><option key={f.id} value={f.id} disabled={!f.manage}>{f.name}</option>)}</select></label><p>Moving changes who can read and edit this envelope and which retention rule applies.</p><button className="iw-fit" disabled={action.busy}>Save envelope folder</button><ErrorNotice error={action.error}/></form>
}
