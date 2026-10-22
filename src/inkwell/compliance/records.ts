import { canonical, id, insist, now, text, type Env } from '../model'
import { atomic, commandWrite, roleGuard } from '../storage'
import { validatePdfText } from '../pdf'
import type { CommandContext } from '../envelopes'
export const builtinMeanings = ['Approval','Review','Responsibility','Authorship']
export async function signingMeanings(env: Env) {
  const rows=(await env.DB.prepare("SELECT data FROM iw_part11_records WHERE kind='meaning' ORDER BY at,id").all<{data:string}>()).results
  return [...new Set([...builtinMeanings,...rows.map(r=>(JSON.parse(r.data) as {meaning:string}).meaning)])]
}
export async function saveComplianceRecord(env: Env, context: CommandContext, input: Record<string, unknown>) {
  insist(['owner','admin'].includes(context.actor.role),'Only an owner or admin can change compliance records.',403)
  const kind=input.kind
  insist(kind==='meaning'||kind==='fda-certification','Choose a compliance record type.')
  let data: Record<string,string>
  if(kind==='meaning') {
    const meaning=text(input.meaning,'the custom signing meaning',120)
    insist(!/[\r\n\t]/.test(meaning),'Use one line for the signing meaning.')
    await validatePdfText([meaning]);data={meaning}
  } else {
    const date=text(input.date,'the FDA certification date',10),reference=text(input.reference,'the FDA certification reference',500)
    insist(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,'Enter a real certification date as YYYY-MM-DD.')
    insist(input.confirm===true,'Confirm this records your organization’s certification, not an Inkwell certification.')
    data={date,reference}
  }
  const result={id:id(),kind,at:now(),actor:context.actor.id,...data}
  await atomic(env.DB,[roleGuard(context.actor,['owner','admin'])],[env.DB.prepare('INSERT INTO iw_part11_records VALUES(?,?,?,?,?)').bind(result.id,kind,result.actor,result.at,canonical(data)),commandWrite(env.DB,context.actor.id,context.commandId,context.fingerprint,result)])
  return result
}
export async function complianceRecords(env: Env) {
  const identities=(await env.DB.prepare("SELECT i.operator_id AS operatorId,i.name,i.email,i.method,i.verified_by AS verifiedBy,i.verified_at AS verifiedAt,i.version,(i.password_hash IS NOT NULL) AS passwordEnrolled,(o.status='active' AND o.version=i.operator_version AND lower(o.email)=i.email) AS current FROM iw_part11_identities i LEFT JOIN oa_operators o ON o.id=i.operator_id ORDER BY i.email").all()).results
  const records=(await env.DB.prepare('SELECT id,kind,actor,at,data FROM iw_part11_records ORDER BY at,id').all<{id:string;kind:string;actor:string;at:string;data:string}>()).results.map(r=>({...r,data:JSON.parse(r.data)}))
  const alerts=(await env.DB.prepare('SELECT id,envelope_id AS envelopeId,signer,cause,at,contacts FROM iw_part11_security_alerts ORDER BY at DESC LIMIT 100').all<{contacts:string}>()).results.map(r=>({...r,contacts:JSON.parse(r.contacts)}))
  return {identities,records,alerts,meanings:await signingMeanings(env),qualification:'unvalidated'}
}
