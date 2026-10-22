import {useState} from 'react'
import {PdfViewer} from './pdf-viewer'
import {ErrorNotice,useAction} from './feedback'

export function RecipientViewing({base,certified,onOpened}:{base:string;certified:boolean;onOpened:()=>Promise<void>}) {
 const [bytes,setBytes]=useState<Uint8Array>(),action=useAction()
 return <section className="iw-stack" aria-label="Required document opening"><h2>{certified?'Certified delivery':'Open your documents'}</h2><p>Open the permitted PDF to complete this routing step. The record stores your authenticated opening time{certified?' on the certificate':''}; it does not assert that you read the documents.</p>{!bytes?<button className="iw-primary iw-fit" disabled={action.busy} onClick={()=>void action.run(async()=>{const response=await fetch(`${base}/document`,{credentials:'same-origin'});if(!response.ok){const result=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(result?.error??'The PDF could not be opened. Reload your invitation and try again.');}setBytes(new Uint8Array(await response.arrayBuffer()));await onOpened()})}>{action.busy?'Opening…':'Open required PDF'}</button>:<><p role="status">Your document opening is recorded.</p><PdfViewer source={bytes}/></>}<ErrorNotice error={action.error}/></section>
}
