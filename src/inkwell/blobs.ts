import { createHash } from 'node:crypto'
// Digest/retention receipts adapted from chest/src/chest/blobs.ts and
// evidence/src/evidence/upload.ts. D1 chunking replaces their object storage.
import { insist, sha256 } from './model'
export const MAX_PDF = 2 * 1024 * 1024
export function fromBase64(value: unknown) { insist(typeof value === 'string' && value.length <= Math.ceil(MAX_PDF / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'Provide a base64 PDF no larger than 2 MiB.'); const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0)); insist(bytes.length > 0 && bytes.length <= MAX_PDF, 'The PDF must be nonempty and no larger than 2 MiB.'); return bytes }
export function blobWrites(db: D1Database, envelopeId: string, kind: string, bytes: Uint8Array) { const writes: D1PreparedStatement[] = []; for (let offset = 0, part = 0; offset < bytes.length; offset += 64 * 1024, part++) writes.push(db.prepare('INSERT INTO iw_blobs(envelope_id,kind,part,data) VALUES(?,?,?,?)').bind(envelopeId,kind,part,bytes.slice(offset,offset + 64 * 1024).buffer)); return writes }
export async function* blobChunks(db:D1Database,envelopeId:string,kind:string) {
 let part=0
 for(;;){const rows=(await db.prepare('SELECT part,data FROM iw_blobs WHERE envelope_id=? AND kind=? AND part>=? ORDER BY part LIMIT 4').bind(envelopeId,kind,part).all<{part:number;data:number[]|ArrayBuffer}>()).results;if(!rows.length)break;for(const row of rows){insist(row.part===part++,'The stored artifact is incomplete.',503);yield new Uint8Array(row.data)}}
 insist(part>0,'This artifact is not available.',404)
}
export async function blobFingerprint(db:D1Database,envelopeId:string,kind:string){const digest=createHash('sha256');for await(const chunk of blobChunks(db,envelopeId,kind))digest.update(chunk);return digest.digest('hex')}
export async function readBlob(db:D1Database,envelopeId:string,kind:string,expected?:string) {
 const row=await db.prepare('SELECT SUM(length(data)) AS bytes FROM iw_blobs WHERE envelope_id=? AND kind=?').bind(envelopeId,kind).first<{bytes:number|null}>();insist(row?.bytes,'This artifact is not available.',404)
 const bytes=new Uint8Array(row.bytes),digest=createHash('sha256');let offset=0
 for await(const chunk of blobChunks(db,envelopeId,kind)){bytes.set(chunk,offset);offset+=chunk.length;digest.update(chunk)}
 insist(offset===bytes.length,'The stored artifact is incomplete.',503);if(expected)insist(digest.digest('hex')===expected,'The stored artifact failed its SHA-256 integrity check.',503)
 return bytes
}
export function download(bytes: Uint8Array, filename: string, mediaType = 'application/pdf', inline = false) { return new Response(bytes as BodyInit, { headers: { 'content-type':mediaType, 'content-disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`, 'cache-control':'no-store', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff', 'content-security-policy':"sandbox; default-src 'none'" } }) }
