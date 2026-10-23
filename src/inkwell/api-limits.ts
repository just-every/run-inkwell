import { id, Refusal, type Envelope, type Env } from './model'
import type { Guard } from './storage'

export class ApiRateLimit extends Refusal {
 constructor(public retryAfter: number) {super('The API rate limit was reached. Retry after the stated number of seconds.',429,'rate_limited')}
}
const minute=60_000,hour=60*minute
const retry = (first:number,window:number,at:number) => Math.max(1,Math.ceil((first+window-at)/1000))
/** One conditional INSERT makes admission atomic even when calls race. No cached key or quota state. */
export async function admitApiRequest(env: Env, keyId: string) {
 const at=Date.now()
 await env.DB.prepare('DELETE FROM iw_api_request_events WHERE at<=?').bind(at-minute).run()
 const result=await env.DB.prepare('INSERT INTO iw_api_request_events(id,key_id,at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM iw_api_request_events WHERE key_id=? AND at>?)<600 RETURNING id').bind(id(),keyId,at,keyId,at-minute).first()
 if(!result){const first=await env.DB.prepare('SELECT MIN(at) AS at FROM iw_api_request_events WHERE key_id=? AND at>?').bind(keyId,at-minute).first<{at:number}>();throw new ApiRateLimit(retry(first!.at,minute,at))}
}
/** Admission for actual invitation release, in the same transaction as its mail and envelope record. */
export async function policySendQuota(env: Env, envelope: Envelope) {
 const origin=envelope.sendOrigin
 if(!origin)return {guards:[] as Guard[],writes:[] as D1PreparedStatement[]}
 const at=Date.now(),key=origin.credential.id
 const account=await env.DB.prepare('SELECT COUNT(*) AS n,MIN(at) AS first FROM iw_policy_send_usage WHERE at>?').bind(at-hour).first<{n:number;first:number}>()
 const credential=await env.DB.prepare('SELECT COUNT(*) AS n,MIN(at) AS first FROM iw_policy_send_usage WHERE credential_id=? AND at>?').bind(key,at-minute).first<{n:number;first:number}>()
 if(account!.n>=3000)throw new ApiRateLimit(retry(account!.first,hour,at))
 if(credential!.n>=60)throw new ApiRateLimit(retry(credential!.first,minute,at))
 return {guards:[{sql:'(SELECT COUNT(*) FROM iw_policy_send_usage WHERE at>?)<3000',values:[at-hour]},{sql:'(SELECT COUNT(*) FROM iw_policy_send_usage WHERE credential_id=? AND at>?)<60',values:[key,at-minute]}],writes:[env.DB.prepare('DELETE FROM iw_policy_send_usage WHERE at<=?').bind(at-24*hour),env.DB.prepare('INSERT INTO iw_policy_send_usage(envelope_id,source,credential_id,at) VALUES(?,?,?,?)').bind(envelope.id,origin.source,key,at)]}
}
