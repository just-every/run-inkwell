import { PDFDocument } from 'pdf-lib'
import { download, readBlob } from './blobs'
import { certificatePdf } from './certificate'
import { insist, object, type Envelope, type Env, type Field } from './model'
import type { EnvelopeDocument } from './documents'

export type DocumentAudience = { signers: number[]; copies: number[] }
export function readDocumentAudience(value: unknown): DocumentAudience | undefined {
 if(value === undefined)return undefined
 const v=object(value)
 insist(Object.keys(v).every(k=>k==='signers'||k==='copies'),'Choose signer and copy document audiences.')
 const indexes=(items:unknown)=>{insist(Array.isArray(items)&&items.every(n=>Number.isInteger(n)&&n>=0)&&new Set(items).size===items.length,'Choose each document recipient once.');return [...items].sort((a,b)=>a-b) as number[]}
 return {signers:indexes(v.signers),copies:indexes(v.copies)}
}
export function canSeeDocument(e:Pick<Envelope,'documents'|'signers'>, index:number, party:number) {
 const d=e.documents?.[index]
 if(!d)return false
 return !d.visibleTo || (party<e.signers.length?d.visibleTo.signers.includes(party):d.visibleTo.copies.includes(party-e.signers.length))
}
export const visibleDocumentIndexes=(e:Envelope,party:number)=>(e.documents??[]).flatMap((_,i)=>canSeeDocument(e,i,party)?[i]:[])
export function recipientPages(e:Envelope,party:number) {
 return e.documents?visibleDocumentIndexes(e,party).flatMap(i=>Array.from({length:e.documents![i].pages},(_,n)=>e.documents![i].pageStart+n)):e.pageSizes.map((_,i)=>i)
}
export function recipientFields(e:Envelope,party:number,fields:Field[]) {
 const pages=recipientPages(e,party)
 return fields.filter(f=>pages.includes(f.page)).map(f=>({...f,page:pages.indexOf(f.page)}))
}
/** Public document IDs remain stable, while displayed page numbers cover only the permitted PDF. */
export function recipientDocuments(e:Envelope,party:number) {
 let pageStart=0
 return visibleDocumentIndexes(e,party).map(index=>{const {visibleTo:_,...d}=e.documents![index],result={...d,index,pageStart};pageStart+=d.pages;return result})
}
export function validateDocumentAudience(documents:EnvelopeDocument[]|undefined,signers:number,copies:number,fields:Field[],hideWithoutFields=false) {
 for(const [i,d] of (documents??[]).entries()) {
  if(d.visibleTo)insist(d.visibleTo.signers.every(n=>n<signers)&&d.visibleTo.copies.every(n=>n<copies),'Choose existing recipients for document visibility.')
  if(hideWithoutFields)d.visibleTo={signers:Array.from({length:signers},(_,n)=>n).filter(n=>(!d.visibleTo||d.visibleTo.signers.includes(n))&&fields.some(f=>f.signer===n&&f.page>=d.pageStart&&f.page<d.pageStart+d.pages)),copies:[]}
  for(const f of fields.filter(f=>f.page>=d.pageStart&&f.page<d.pageStart+d.pages))insist(!d.visibleTo||d.visibleTo.signers.includes(f.signer),`A hidden document cannot contain fields for signer ${f.signer+1}.`)
 }
}
/** A paper scan may contain every document its uploader saw. It accompanies a scoped download only when all of
 * those documents are permitted to the viewer; a component never carries an unrelated scan. */
export function permittedScanPages(e:Envelope,allowed:number[]) {
 let offset=e.pageSizes.length;const pages:number[]=[]
 for(const [i,s] of e.signers.entries())if(s.paper?.status==='accepted') {
  const count=s.paper.pages,scope=visibleDocumentIndexes(e,i)
  if(scope.every(d=>allowed.includes(d)))pages.push(...Array.from({length:count},(_,n)=>offset+n))
  offset+=count
 }
 return pages
}
export async function recipientPdf(env:Env,e:Envelope,party:number,executed=false) {
 const kind=executed?'signed':'original',hash=executed?e.signedSha256:e.originalSha256
 const bytes=await readBlob(env.DB,e.id,kind,hash)
 if(!e.documents)return bytes
 if(visibleDocumentIndexes(e,party).length===e.documents.length)return bytes
 const pages=recipientPages(e,party);insist(pages.length,'No documents are visible to this recipient.',404)
 if(executed)pages.push(...permittedScanPages(e,visibleDocumentIndexes(e,party)))
 const source=await PDFDocument.load(bytes),output=await PDFDocument.create({updateMetadata:false})
 for(const page of await output.copyPages(source,pages))output.addPage(page)
 return new Uint8Array(await output.save())
}
export async function recipientCertificate(env:Env,e:Envelope,party:number) {
 if(!e.documents||visibleDocumentIndexes(e,party).length===e.documents.length)return readBlob(env.DB,e.id,'certificate',e.certificateSha256)
 return new Uint8Array(await certificatePdf(e,[],visibleDocumentIndexes(e,party)))
}
async function recipientComponent(env:Env,e:Envelope,party:number,index:number) {
 const scope=visibleDocumentIndexes(e,party),d=e.documents![index]
 const unsafeScan=e.signers.some((s,i)=>s.paper?.status==='accepted'&&visibleDocumentIndexes(e,i).some(k=>!scope.includes(k)))
 if(!unsafeScan)return readBlob(env.DB,e.id,`executed-${index}`,d.signedSha256)
 const source=await PDFDocument.load(await readBlob(env.DB,e.id,'signed',e.signedSha256)),output=await PDFDocument.create({updateMetadata:false})
 for(const page of await output.copyPages(source,[...Array.from({length:d.pages},(_,n)=>d.pageStart+n),...permittedScanPages(e,scope)]))output.addPage(page)
 return new Uint8Array(await output.save())
}
export async function recipientArtifact(env:Env,e:Envelope,party:number,kind:string) {
 if(kind==='signed')return download(await recipientPdf(env,e,party,true),`${e.id}-executed.pdf`)
 if(kind==='certificate')return download(await recipientCertificate(env,e,party),`${e.id}-certificate.pdf`)
 const match=/^executed-([0-9]+)$/.exec(kind),index=Number(match?.[1]),d=e.documents?.[index]
 insist(match&&d&&canSeeDocument(e,index,party),'Document not found.',404)
 insist(d.signedSha256,'This document is not yet executed.',404)
 return download(await recipientComponent(env,e,party,index),`executed-${d.filename}`)
}

/** Recipient list edits preserve grants by copy identity; new copy recipients default to all documents only when the
 * sender explicitly sends them a completed copy. The before/after scope is part of the ordinary audit record. */
export function remapCopyAudience(e:Envelope,previous:NonNullable<Envelope['copies']>,newCopiesAll=false) {
 for(const d of e.documents??[])if(d.visibleTo)d.visibleTo.copies=(e.copies??[]).flatMap((c,i)=>{const old=previous.findIndex(p=>p.email===c.email);return old<0?newCopiesAll?[i]:[]:d.visibleTo!.copies.includes(old)?[i]:[]})
}
export function remapSignerAudience(documents:EnvelopeDocument[]|undefined,kept:number[]) {
 return documents?.map(d=>({...d,...(d.visibleTo?{visibleTo:{signers:d.visibleTo.signers.filter(i=>kept.includes(i)).map(i=>kept.indexOf(i)),copies:[...d.visibleTo.copies]}}:{})}))
}
