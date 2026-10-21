import { verifyFreeFormRecord } from './freeform-fields'
// RECORD-004: anyone holding an executed PDF or certificate checks it against this installation without signing in.
// Only the uploaded file's own fingerprint is looked up, so a file that matches nothing reveals nothing else.
import { insist, sha256, type Env, type Envelope } from './model'
import { readBytes } from './body'
import { verifyEnvelope } from './envelopes'
export const verificationLimit = 25 * 1024 * 1024
export async function publicVerification(env: Env, request: Request) {
 insist(request.headers.get('content-type')?.split(';')[0]==='application/pdf','Upload the PDF itself with Content-Type application/pdf.',415)
 const bytes=await readBytes(request,verificationLimit);insist(bytes.length>0,'Choose a PDF to verify.')
 const fingerprint=await sha256(bytes)
 const row=await env.DB.prepare("SELECT data FROM iw_envelopes WHERE json_extract(data,'$.status')='completed' AND (json_extract(data,'$.signedSha256')=?1 OR json_extract(data,'$.certificateSha256')=?1) LIMIT 1").bind(fingerprint).first<{data:string}>()
 if(!row)return{match:false,sha256:fingerprint}
 const envelope:Envelope=JSON.parse(row.data),check=await verifyEnvelope(env,envelope)
 if(!check.ok||!await verifyFreeFormRecord(envelope))return{match:false,sha256:fingerprint}
 return{match:true,sha256:fingerprint,document:envelope.signedSha256===fingerprint?'executed':'certificate',envelope:{id:envelope.id,title:envelope.title,completedAt:envelope.signers.at(-1)?.signedAt,signers:envelope.signers.filter(s=>!s.removedAt).map(({name,signedAt})=>({name,signedAt})),signedSha256:envelope.signedSha256,certificateSha256:envelope.certificateSha256,auditEvents:envelope.events.length}}
}
