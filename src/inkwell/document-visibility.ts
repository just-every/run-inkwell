import { PDFDocument } from 'pdf-lib'
import { insist, sha256, type Envelope, type Env, type Field } from './model'
import { download, readBlob } from './blobs'

export function chooseVisibleDocuments(value: unknown, count: number) {
 if (value === undefined) return undefined
 insist(Array.isArray(value) && value.length <= count && new Set(value).size === value.length && value.every(i => Number.isInteger(i) && i >= 0 && i < count), 'Choose existing documents once each for recipient visibility.')
 return [...value as number[]].sort((a,b)=>a-b)
}
export function visibleDocumentIndexes(e: Pick<Envelope,'documents'|'signers'|'copies'>, party: number): number[] {
 const recipient = party < e.signers.length ? e.signers[party] : e.copies?.[party-e.signers.length]
 insist(recipient, 'Recipient not found.',404)
 return recipient.visibleDocuments ?? Array.from({length:e.documents?.length ?? 1},(_,i)=>i)
}
export function visiblePages(e: Envelope, party: number) {
 return visibleDocumentIndexes(e,party).flatMap(i => e.documents ? Array.from({length:e.documents[i].pages},(_,p)=>e.documents![i].pageStart+p) : e.pageSizes.map((_,p)=>p))
}
export function projectedFields(e: Envelope, party: number, fields: Field[]) {
 const pages=visiblePages(e,party),indexes=visibleDocumentIndexes(e,party)
 return fields.flatMap(f=>pages.includes(f.page)?[{...f,page:pages.indexOf(f.page),...(f.document===undefined?{}:{document:indexes.indexOf(f.document)})}]:[])
}
export function projectedDocuments(e: Envelope, party: number) {
 let start=0
 return visibleDocumentIndexes(e,party).flatMap(index=>{const d=e.documents?.[index];if(!d)return[];const result={...d,index,pageStart:start};start+=d.pages;return[result]})
}
/** A scan can cover several documents. A narrower audience never receives a scan covering a hidden document. */
function artifactPages(e: Envelope, party: number, signed: boolean, document?: number) {
 const visible=visibleDocumentIndexes(e,party)
 if(document!==undefined)insist(Number.isInteger(document)&&visible.includes(document)&&e.documents?.[document],'Document not found.',404)
 const pages=document===undefined?visiblePages(e,party):Array.from({length:e.documents![document].pages},(_,n)=>e.documents![document].pageStart+n)
 if(signed){let start=e.pageSizes.length;for(const [i,s] of e.signers.entries())if(s.paper?.status==='accepted'){if(visibleDocumentIndexes(e,i).every(d=>visible.includes(d)))pages.push(...Array.from({length:s.paper.pages},(_,n)=>start+n));start+=s.paper.pages}}
 return pages
}
export async function recipientPdf(env: Env,e: Envelope,party:number,signed:boolean,document?:number) {
 const pages=artifactPages(e,party,signed,document),hash=signed?e.signedSha256:e.originalSha256
 insist(hash,'This artifact is not yet available.',404)
 const bytes=await readBlob(env.DB,e.id,signed?'signed':'original',hash)
 if(document===undefined&&pages.length===e.pageSizes.length+ (signed?e.signers.reduce((n,s)=>n+(s.paper?.status==='accepted'?s.paper.pages:0),0):0))return bytes
 const source=await PDFDocument.load(bytes),output=await PDFDocument.create({updateMetadata:false})
 for(const page of await output.copyPages(source,pages))output.addPage(page)
 if(signed&&e.part11){const {appendManifestations}=await import('./compliance/manifestation');await appendManifestations(output,{...e,fields:e.fields.filter(f=>(document===undefined?visibleDocumentIndexes(e,party):[document]).includes(f.document??0))})}
 // pdf-lib otherwise inserts a default blank page for an empty audience; it contains no source content.
 return new Uint8Array(await output.save())
}
export async function recipientArtifactBytes(env:Env,e:Envelope,party:number,kind:string) {
 insist(['signed','certificate'].includes(kind)||/^executed-[0-9]+$/.test(kind),'Artifact not found.',404)
 insist(e.status==='completed','Completed artifacts are not available.',404)
 if(kind==='certificate'){
  if(visibleDocumentIndexes(e,party).length===(e.documents?.length??1))return readBlob(env.DB,e.id,'certificate',e.certificateSha256)
  const {certificatePdf}=await import('./certificate'),signed=await recipientPdf(env,e,party,true)
  return new Uint8Array(await certificatePdf(e,[],{party,signedSha256:await sha256(signed)}))
 }
 const index=kind.startsWith('executed-')?Number(kind.slice(9)):undefined
 if(index!==undefined){artifactPages(e,party,true,index);if(visibleDocumentIndexes(e,party).length===(e.documents?.length??1)){const d=e.documents![index];return readBlob(env.DB,e.id,kind,d.signedSha256)}}
 return recipientPdf(env,e,party,true,index)
}
export async function recipientArtifact(env:Env,e:Envelope,party:number,kind:string) {
 return download(await recipientArtifactBytes(env,e,party,kind),`${e.id}-${kind}.pdf`)
}
