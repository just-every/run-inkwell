import { insist, Refusal, sha256, type Env } from './model'
import type { Guard } from './storage'
export type SalesforceEnv=Env&{SALESFORCE_ACCESS_TOKEN?:string;SALESFORCE_INSTANCE_URL?:string;SALESFORCE_ACCOUNT_ID?:string}
export interface SalesforceCredential{id:string;version:number;accountId:string;token:string;origin:string}
/** Instance and organization are installation configuration; rotation permanently retires prior grants. */
export async function salesforceCredential(env:SalesforceEnv):Promise<SalesforceCredential>{
 const token=env.SALESFORCE_ACCESS_TOKEN,accountId=env.SALESFORCE_ACCOUNT_ID,origin=env.SALESFORCE_INSTANCE_URL
 if(!token||!accountId||!/^[A-Za-z0-9_-]{1,100}$/.test(accountId)||!origin||!/^https:\/\/[a-z0-9-]+(?:\.sandbox)?\.my\.salesforce\.com$/.test(origin)||/[\x00-\x20\x7f]/.test(token)){
  await env.DB.prepare("UPDATE iw_salesforce_credentials SET active=0 WHERE id='salesforce' AND active=1").run()
  throw new Refusal('Ask the owner to configure the Salesforce organization, instance and access credential.',503)
 }
 const hash=await sha256(origin+'\n'+token)
 await env.DB.prepare("INSERT INTO iw_salesforce_credentials(id,version,account_id,token_hash,active) VALUES('salesforce',1,?,?,1) ON CONFLICT(id) DO UPDATE SET version=iw_salesforce_credentials.version+1,account_id=excluded.account_id,token_hash=excluded.token_hash,active=1 WHERE iw_salesforce_credentials.token_hash<>excluded.token_hash OR iw_salesforce_credentials.account_id<>excluded.account_id OR iw_salesforce_credentials.active<>1").bind(accountId,hash).run()
 const row=await env.DB.prepare("SELECT version,account_id,token_hash,active FROM iw_salesforce_credentials WHERE id='salesforce'").first<{version:number;account_id:string;token_hash:string;active:number}>()
 insist(row?.active===1&&row.token_hash===hash&&row.account_id===accountId,'Salesforce configuration changed. Refresh.',409)
 return {id:'salesforce',version:row.version,accountId,token,origin}
}
export function salesforceCredentialGuard(c:SalesforceCredential):Guard{return{sql:'EXISTS(SELECT 1 FROM iw_salesforce_credentials WHERE id=? AND version=? AND account_id=? AND active=1)',values:[c.id,c.version,c.accountId]}}
export async function assertSalesforceCredential(env:SalesforceEnv,c:SalesforceCredential){const live=await salesforceCredential(env);insist(live.version===c.version&&live.accountId===c.accountId,'Salesforce authority was retired. Authorize again.',403)}
export async function salesforceResponse(env:SalesforceEnv,c:SalesforceCredential,path:string,init:RequestInit={method:'GET'}){
 insist(/^\/services\/data\/v64\.0\/[A-Za-z][^\x00-\x20\\#]*$/.test(path),'Invalid Salesforce endpoint.')
 await assertSalesforceCredential(env,c)
 let response:Response
 try{response=await fetch(c.origin+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:`Bearer ${c.token}`},redirect:'manual',signal:AbortSignal.timeout(30_000)})}catch{throw new Refusal('Salesforce did not return a verifiable response. Reconcile manually.',502)}
 if(response.status===401||response.status===403)await env.DB.prepare("UPDATE iw_salesforce_credentials SET active=0 WHERE id=? AND version=?").bind(c.id,c.version).run()
 if(!response.ok){await response.body?.cancel();throw new Refusal('Salesforce refused the request. Check configuration and reconcile manually.',502)}
 await assertSalesforceCredential(env,c)
 return response
}
export async function salesforceRequest(env:SalesforceEnv,c:SalesforceCredential,path:string,init?:RequestInit):Promise<Record<string,unknown>>{
 const response=await salesforceResponse(env,c,path,init)
 if(response.status===204)return {}
 try{const body=await response.text();insist(body.length<=4_000_000,'Salesforce response is too large.',502);const value=JSON.parse(body);insist(value&&typeof value==='object'&&!Array.isArray(value),'Invalid Salesforce response.',502);return value}catch{throw new Refusal('Salesforce returned an invalid response.',502)}
}
