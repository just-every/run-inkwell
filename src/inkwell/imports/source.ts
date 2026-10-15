import { Buffer } from 'node:buffer'
import { PDFDocument } from 'pdf-lib'
import { canonicalJson, sha256, type SourceBundle, type ImportMapping, type Json } from '../../modules/import-kit/src/d1/index'

export const NAMESPACE = 'docuseal-completed-archive'
export const MAPPING = '1'
export const MAX_ARCHIVE_BYTES = 750_000
type Obj = Record<string, any>
export interface ArchiveFile { role:'signed'|'audit'; name:string; url:string; base64:string; sha256:string; size:number }
export interface ArchiveValue { sourceId:string; title:string; completedAt:string; metadata:Obj; files:ArchiveFile[]; provider:'docuseal'; account:string }
const object = (v:unknown, label:string):Obj => {
 if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`INVALID_ARCHIVE: ${label} must be an object`)
 return v as Obj
}
const text = (v:unknown, label:string):string => {
 if (typeof v !== 'string' || !v.trim() || v.length>4096) throw new Error(`INVALID_ARCHIVE: ${label} is required`)
 return v
}
const instant = (v:unknown) => typeof v==='string' && Number.isFinite(Date.parse(v))

/** No URL fetches: custody consists only of the bytes explicitly uploaded. */
export async function readArchive(input:unknown):Promise<{source:SourceBundle;mapping:ImportMapping;digest:string}> {
 const raw = typeof input==='string' ? input : JSON.stringify(input)
 if (!raw || Buffer.byteLength(raw)>MAX_ARCHIVE_BYTES) throw new Error(`ARCHIVE_TOO_LARGE: supply at most ${MAX_ARCHIVE_BYTES} UTF-8 bytes, including base64 files`)
 const archive=object(JSON.parse(raw),'archive')
 if (archive.provider!=='docuseal') throw new Error('INVALID_ARCHIVE: provider must be docuseal')
 const account=text(archive.account,'account')
 if (account.length>200) throw new Error('INVALID_ARCHIVE: account must be at most 200 characters')
 if (!Array.isArray(archive.submissions) || !archive.submissions.length || archive.submissions.length>100) throw new Error('INVALID_ARCHIVE: supply 1–100 submissions')
 if (!Array.isArray(archive.files)) throw new Error('INVALID_ARCHIVE: files must be an array')
 const supplied=new Map<string, {name:string;base64:string;sha256:string;size:number}>()
 for (const [i,item] of archive.files.entries()) {
  const f=object(item,`files[${i}]`),url=text(f.url,'file.url'),name=text(f.name,'file.name'),base64=f.base64
  if (typeof base64!=='string' || !base64) throw new Error('INVALID_ARCHIVE: file.base64 is required')
  if (supplied.has(url)) throw new Error('INVALID_ARCHIVE: a file URL is repeated')
  const bytes=Buffer.from(base64,'base64')
  if (bytes.toString('base64')!==base64 || bytes.subarray(0,5).toString()!=='%PDF-') throw new Error('INVALID_PDF: supply canonical base64 PDF bytes')
  const pdf=await PDFDocument.load(bytes,{updateMetadata:false})
  if (!pdf.getPageCount()) throw new Error('INVALID_PDF: a file has no pages')
  supplied.set(url,{name,base64,sha256:sha256(bytes),size:bytes.length})
 }
 const digest=sha256(raw)
 const source:SourceBundle={records:[],diagnostics:[],artifacts:[{name:'docuseal-archive.json',sha256:digest,size:Buffer.byteLength(raw),original:{status:'available',base64:Buffer.from(raw).toString('base64')}}]}
 const effects=new Map<string,ArchiveValue>()
 const seen=new Set<string>()
 for (const [i,item] of archive.submissions.entries()) {
  const submission=object(item,`submissions[${i}]`)
  if (!Number.isSafeInteger(submission.id) || submission.id<1) throw new Error('INVALID_ARCHIVE: submission id must be a positive safe integer')
  const sourceId=`${account}:${submission.id}`
  const diagnostic=(code:string,message:string) => source.diagnostics.push({severity:'warning',code,message,sourceId})
  const files:ArchiveFile[]=[]
  let rejection=''
  if (submission.status!=='completed') rejection='Submission is not completed.'
  else if (!instant(submission.completed_at)) rejection='Completed submission has no valid completion timestamp.'
  else if (!Array.isArray(submission.submitters) || !submission.submitters.length || submission.submitters.some((s:any)=>!s || s.status!=='completed' || !instant(s.completed_at) || typeof s.email!=='string' || typeof s.role!=='string' || (s.name!==null && typeof s.name!=='string'))) rejection='Every submitter must have a documented identity, completed status and timestamp.'
  else if (!Array.isArray(submission.documents) || !submission.documents.length) rejection='Completed submission has no signed documents.'
  else {
   const required=[...submission.documents.map((d:any)=>({url:d?.url,role:'signed' as const})),{url:submission.audit_log_url,role:'audit' as const}]
   for (const ref of required) {
    const file=typeof ref.url==='string' ? supplied.get(ref.url) : undefined
    if (!file) { rejection='Signed documents and the upstream audit PDF must all be supplied by their exact provider URLs.';break }
    files.push({...file,url:ref.url,role:ref.role})
   }
  }
  if (seen.has(sourceId)) diagnostic('DUPLICATE_SUBMISSION','This source account and submission ID appears more than once; Base will compare the records.')
  seen.add(sourceId)
  if (rejection) diagnostic('SUBMISSION_REJECTED',rejection)
  const value:ArchiveValue={provider:'docuseal',account,sourceId,title:typeof submission.name==='string'&&submission.name.trim()?submission.name:typeof submission.template?.name==='string'?submission.template.name:`DocuSeal submission ${submission.id}`,completedAt:submission.completed_at||'',metadata:submission,files}
  if (Buffer.byteLength(canonicalJson(value))>MAX_ARCHIVE_BYTES) throw new Error('ARCHIVE_TOO_LARGE: expanded submission evidence exceeds the per-record limit')
  // Include the actual file bytes in source identity comparisons, never URL-only custody.
  const payload={submission,files,rejection}
  const payloadHash=sha256(canonicalJson(payload))
  source.records.push({namespace:NAMESPACE,kind:'submission',sourceId:rejection?`${sourceId}:rejected:${payloadHash}`:sourceId,payload:payload as unknown as Json,payloadHash,artifactHash:digest,location:{artifact:'docuseal-archive.json',pointer:`/submissions/${i}`}})
  if (!rejection) effects.set(sha256(canonicalJson(payload)),value)
 }
 return {source,digest,mapping:{version:MAPPING,map:record=>{
  const value=effects.get(record.payloadHash)
  return value ? {effects:[{targetKind:'archive',targetId:sha256(canonicalJson([NAMESPACE,record.sourceId])),value:value as unknown as Json}]} : {effects:[],rejection:(record.payload as Obj).rejection}
 }}}
}
