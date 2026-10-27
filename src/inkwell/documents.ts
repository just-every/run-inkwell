import {watermark} from './test-mode'
import { objectWrites, copyObjectWrites } from './object-artifacts'
import { readDocumentAudience } from './document-visibility'
import { PDFDocument } from 'pdf-lib'
import { active, canonical, id, insist, now, object, sha256, text, type Actor, type Envelope, type Env, type Field } from './model'
import { blobFingerprint, fromBase64, readBlob } from './blobs'
import { parsePdf, validatePdfText } from './pdf'
import { atomic, roleGuard } from './storage'
import { readBytes } from './body'
export const MAX_ENVELOPE_BYTES=100*1024*1024
export type EnvelopeDocument={filename:string;sha256:string;bytes:number;pageStart:number;pages:number;mode:'sign'|'optional'|'view';visibleTo?:import('./document-visibility').DocumentAudience;signedSha256?:string}
export const documentKind=(index:number,signed=false)=>`${signed?'executed':'document'}-${index}`
const chunkBytes=64*1024
export async function stagedBlobWrites(env:Env,envelopeId:string,kind:string,bytes:Uint8Array) {
 return objectWrites(env,'envelope',envelopeId,kind,bytes)
}

export async function uploadPdf(env:Env,actor:Actor,request:Request,uploadId?:string,part?:string) {
 if(!uploadId) {
  const input=object(await request.json()),filename=text(input.filename,'a PDF filename',240),size=Number(input.bytes)
  insist(filename.toLowerCase().endsWith('.pdf')&&!/[\x00-\x1f/\\]/.test(filename),'Choose a PDF filename.')
  insist(Number.isSafeInteger(size)&&size>0&&size<=25*1024*1024,'A document must be nonempty and no larger than 25 MiB.')
  const uploadId=id();await atomic(env.DB,[roleGuard(actor)],[env.DB.prepare('INSERT INTO iw_pdf_uploads(id,actor,size,filename,created_at) VALUES(?,?,?,?,?)').bind(uploadId,env.embedAllocation?'embed:'+env.embedAllocation:actor.id,size,filename,now())]);return{id:uploadId,chunkBytes}
 }
 const upload=await env.DB.prepare('SELECT actor,size FROM iw_pdf_uploads WHERE id=?').bind(uploadId).first<{actor:string;size:number}>()
 insist(upload&&upload.actor===(env.embedAllocation?'embed:'+env.embedAllocation:actor.id),'PDF upload not found.',404)
 const index=Number(part);insist(/^\d+$/.test(part??'')&&Number.isSafeInteger(index)&&index>=0&&index<Math.ceil(upload.size/chunkBytes),'Choose an upload part.')
 const bytes=await readBytes(request,chunkBytes),expected=Math.min(chunkBytes,upload.size-index*chunkBytes)
 insist(bytes.length===expected,'This upload part has the wrong byte count.')
 const key=`staging/${uploadId}/${index}`,old=await env.ARTIFACTS.get(key)
 if(old){insist(await sha256(new Uint8Array(await old.arrayBuffer()))===await sha256(bytes),'This upload part already contains different bytes.',409);return{part:index}}
 await atomic(env.DB,[roleGuard(actor),{sql:'EXISTS(SELECT 1 FROM iw_pdf_uploads WHERE id=? AND actor=?)',values:[uploadId,env.embedAllocation?'embed:'+env.embedAllocation:actor.id]}],[])
 const saved=await env.ARTIFACTS.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}})
 if(!saved){const existing=await env.ARTIFACTS.get(key);insist(existing&&await sha256(new Uint8Array(await existing.arrayBuffer()))===await sha256(bytes),'This upload part already contains different bytes.',409)}
 return{part:index}
}
export async function uploadedBytes(env:Env,actor:Actor|undefined,uploadId:unknown) {
 insist(actor,'Use a member session for staged document uploads.',403)
 const upload=await env.DB.prepare('SELECT actor,size,filename FROM iw_pdf_uploads WHERE id=?').bind(text(uploadId,'a PDF upload ID')).first<{actor:string;size:number;filename:string}>()
 insist(upload&&upload.actor===(env.embedAllocation?'embed:'+env.embedAllocation:actor.id),'PDF upload not found.',404)
 const bytes=new Uint8Array(upload.size);let offset=0
 for(let part=0;offset<bytes.length;part++){
  const row=await env.ARTIFACTS.get(`staging/${uploadId}/${part}`);insist(row,'The PDF upload is incomplete.',409)
  const chunk=new Uint8Array(await row.arrayBuffer());insist(chunk.length===Math.min(chunkBytes,bytes.length-offset),'The PDF upload is incomplete.',409);bytes.set(chunk,offset);offset+=chunk.length
 }
 return{bytes,filename:upload.filename}
}
/** Preserve each original separately and use one normalized page space for the existing placement/signing doors. */
export async function readDocuments(env:Env,input:Record<string,unknown>,actor?:Actor,previous?:Envelope, retained?:{documents:EnvelopeDocument[];read:(index:number)=>Promise<Uint8Array>}) {
 if(input.documents===undefined)return undefined
 insist(Array.isArray(input.documents)&&input.documents.length>=1&&input.documents.length<=20,'Add 1–20 ordered documents.')
 let declared=0
 for(const value of input.documents){const d=object(value);if(d.uploadId!==undefined){const row=await env.DB.prepare('SELECT actor,size FROM iw_pdf_uploads WHERE id=?').bind(text(d.uploadId,'a PDF upload ID')).first<{actor:string;size:number}>();insist(actor&&row?.actor===(env.embedAllocation?'embed:'+env.embedAllocation:actor.id),'PDF upload not found.',404);declared+=row.size}else if(d.existing!==undefined){const old=(retained?.documents??previous?.documents)?.[Number(d.existing)];insist(old,'Document not found.');declared+=old.bytes}else if(typeof d.pdfBase64==='string')declared+=Math.floor(d.pdfBase64.length*3/4)-(d.pdfBase64.endsWith('==')?2:d.pdfBase64.endsWith('=')?1:0)}
 insist(declared<=MAX_ENVELOPE_BYTES,'The documents exceed the envelope’s 100 MiB total limit.')
 const combined=await PDFDocument.create(),documents:EnvelopeDocument[]=[],originals:Uint8Array[]=[];let total=0
 for(const value of input.documents){
  const d=object(value),mode=d.mode??'sign';insist(['sign','optional','view'].includes(String(mode)),'Choose sign, optional or view for each document.')
  let bytes:Uint8Array,filename:string
  if(d.existing!==undefined){const documents=retained?.documents??previous?.documents;insist(Number.isInteger(d.existing)&&documents?.[Number(d.existing)],'Choose a document in this draft.');const index=Number(d.existing),old=documents[index];bytes=retained?await retained.read(index):await readBlob(env,previous!.id,documentKind(index),old.sha256);insist(await sha256(bytes)===old.sha256,'Stored document fingerprint failed.',503);filename=old.filename}
  else if(d.uploadId!==undefined){const uploaded=await uploadedBytes(env,actor,d.uploadId);bytes=uploaded.bytes;filename=uploaded.filename}
  else {bytes=fromBase64(d.pdfBase64);filename=text(d.filename,'a PDF filename',240)}
  insist(filename.toLowerCase().endsWith('.pdf')&&!/[\x00-\x1f/\\]/.test(filename),'Choose a PDF filename.')
  insist(bytes.length<=25*1024*1024,'Each source document must be no larger than 25 MiB.')
  if(actor?.testMode)bytes=await watermark(bytes)
  total+=bytes.length;insist(total<=MAX_ENVELOPE_BYTES,'The documents exceed the envelope’s 100 MiB total limit.')
  await validatePdfText([filename])
  const {document,pageSizes}=await parsePdf(bytes),pageStart=combined.getPageCount()
  for(const page of await combined.copyPages(document,document.getPageIndices()))combined.addPage(page)
  documents.push({filename,sha256:await sha256(bytes),bytes:bytes.length,pageStart,pages:pageSizes.length,mode:mode as EnvelopeDocument['mode'],...(d.visibleTo===undefined?{}:{visibleTo:readDocumentAudience(d.visibleTo)})});originals.push(bytes)
 }
 // Editing messages or recipients does not regenerate the frozen PDF when its component order is unchanged.
 const keepsPages=previous&&!retained&&previous.documents?.length===documents.length&&input.documents.every((value,index)=>object(value).existing===index)
 const bytes=keepsPages?await readBlob(env,previous.id,'original',previous.originalSha256):documents.length===1?originals[0]:new Uint8Array(await combined.save()),parsed=await parsePdf(bytes,2000)
 return{bytes,...parsed,documents,originals}
}
export function documentFields(fields:Field[],documents:EnvelopeDocument[]|undefined,signers:number,freeForm=false,removed:number[]=[],people?:Envelope['signers']) {
 if(!documents)return fields
 for(const f of fields){const index=documents.findIndex(d=>f.page>=d.pageStart&&f.page<d.pageStart+d.pages);insist(index>=0,'Place fields on an existing document page.');const d=documents[index];insist(d.mode!=='view','View-only documents cannot contain signing fields.');insist(!d.visibleTo||d.visibleTo.signers.includes(f.signer)||people?.[f.signer]?.witnessDocuments?.includes(index),'A hidden document cannot contain fields for this signer.');f.document=index;f.documentPage=f.page-d.pageStart;if(d.mode==='optional')f.required=false}
 if(!freeForm)for(const [i,d] of documents.entries())if(d.mode==='sign')for(let signer=0;signer<signers;signer++)if(!removed.includes(signer)&&(!d.visibleTo||d.visibleTo.signers.includes(signer)))insist(fields.some(f=>f.document===i&&f.signer===signer&&f.type==='signature'&&f.required!==false),`Place a required signature for signer ${signer+1} on ${d.filename}.`)
 return fields
}
export async function documentWrites(env:Env,envelopeId:string,originals:Uint8Array[]|undefined) {
 const writes:D1PreparedStatement[]=[]
 for(const [i,bytes] of (originals??[]).entries())writes.push(...await objectWrites(env,'envelope',envelopeId,documentKind(i),bytes))
 return writes
}
export function copiedDocumentWrites(env:Env,source:Envelope,destination:string) {
 return (source.documents??[]).flatMap((_,i)=>[copyObjectWrites(env,'envelope',source.id,'envelope',destination,documentKind(i)),env.DB.prepare('INSERT INTO iw_blobs(envelope_id,kind,part,data) SELECT ?,kind,part,data FROM iw_blobs WHERE envelope_id=? AND kind=?').bind(destination,source.id,documentKind(i))])
}

export async function executedDocuments(env:Env,e:Envelope,combined:Uint8Array) {
 const writes:D1PreparedStatement[]=[]
 if(!e.documents)return writes
 const pdf=await PDFDocument.load(combined)
 for(const [i,d] of e.documents.entries()){
  const output=await PDFDocument.create();for(const page of await output.copyPages(pdf,[...Array.from({length:d.pages},(_,n)=>d.pageStart+n),...Array.from({length:pdf.getPageCount()-e.pageSizes.length},(_,n)=>e.pageSizes.length+n)]))output.addPage(page)
  const bytes=new Uint8Array(await output.save());d.signedSha256=await sha256(bytes);writes.push(...await stagedBlobWrites(env,e.id,documentKind(i,true),bytes))
 }
 return writes
}

export function documentInputFields(value:unknown,documents:EnvelopeDocument[]|undefined){if(!documents||!Array.isArray(value))return value;return value.map(f=>{if(!f||typeof f!=='object'||f.document===undefined)return f;const d=documents[f.document];insist(Number.isInteger(f.document)&&d,'Choose an existing document for each field.');const local=f.documentPage??f.page;insist(Number.isInteger(local)&&local>=0&&local<d.pages,'Choose a page in the field’s document.');return{...f,page:d.pageStart+local,documentPage:local}})}

export function consumedUploadWrites(env:Env,input:Record<string,unknown>){return(Array.isArray(input.documents)?input.documents:[]).flatMap(d=>typeof d?.uploadId==='string'?[env.DB.prepare('DELETE FROM iw_pdf_upload_parts WHERE upload_id=?').bind(d.uploadId),env.DB.prepare('DELETE FROM iw_pdf_uploads WHERE id=?').bind(d.uploadId)]:[])}

export async function verifyDocumentArtifacts(env:Env,e:Envelope){for(const [i,d] of (e.documents??[]).entries())insist(await blobFingerprint(env,e.id,documentKind(i))===d.sha256,'A stored document failed its SHA-256 integrity check.',503)}
