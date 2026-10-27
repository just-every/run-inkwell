import { useEffect, useState } from 'react'
import { request, type Field } from './types'
import { ErrorNotice, useAction } from './feedback'
export type MicrosoftProposal={uploadId:string;filename:string;pdfBase64:string;sha256:string;participants:{name:string;email:string}[];fields:Field[]}
/** Add-in harnesses pass resource IDs; Graph supplies the document and participants. Sending stays in native review. */
export function MicrosoftSource({onLoad}:{onLoad:(proposal:MicrosoftProposal)=>void}){
 const [kind,setKind]=useState('onedrive'),[driveId,setDrive]=useState(''),[itemId,setItem]=useState(''),[messageId,setMessage]=useState(''),[self,setSelf]=useState(false)
 const action=useAction(),[officeReady,setOfficeReady]=useState(false)
 useEffect(()=>{
  type OfficeHost={context?:{mailbox?:{item?:{itemId?:string};convertToRestId?:(id:string,version:string)=>string};document?:{url?:string}};onReady?:(callback:()=>void)=>void}
  const host=(window as unknown as {Office?:OfficeHost}).Office
  const ready=()=>{const mailbox=host?.context?.mailbox;if(mailbox?.item?.itemId){setKind('outlook');setMessage(mailbox.convertToRestId?.(mailbox.item.itemId,'v2.0')??mailbox.item.itemId);setOfficeReady(true)}}
  if(host?.onReady)host.onReady(ready);else ready()
 },[])
 return <details className="iw-stack" open={officeReady||undefined}><summary>Pick from Microsoft 365</summary><div className="iw-stack" role="region" aria-label="Microsoft 365 source">
  <p>Use your connected OneDrive or SharePoint file, open Outlook message, or open Word document. Review the proposed recipients and fields before saving.</p>
  <label>Microsoft source<select value={kind} onChange={e=>setKind(e.target.value)}><option value="onedrive">OneDrive</option><option value="sharepoint">SharePoint</option><option value="outlook">Outlook message</option><option value="word">Word document</option></select></label>
  {kind==='outlook'?<label>Outlook message ID<input value={messageId} onChange={e=>setMessage(e.target.value)} maxLength={240}/></label>:<><label>Microsoft drive ID<input value={driveId} onChange={e=>setDrive(e.target.value)} maxLength={240}/></label><label>Microsoft file ID<input value={itemId} onChange={e=>setItem(e.target.value)} maxLength={240}/></label></>}
  <label className="iw-check"><input type="checkbox" checked={self} onChange={e=>setSelf(e.target.checked)}/>Sign it myself</label>
  <button type="button" disabled={action.busy} onClick={()=>void action.run(async()=>onLoad(await request<MicrosoftProposal>('/api/inkwell/microsoft/source',{kind,driveId,itemId,messageId,self})))}>Load Microsoft document</button>
  <ErrorNotice error={action.error}/>
 </div></details>
}
