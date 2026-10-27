import { ApiRateLimit } from './api-limits'
import type { Env } from './model'
import type { RemoteReadControl } from './remote-import-provider'

/** A provider reset applies to every native import door, including a new account review. */
export function remoteReadControl(env:Env,provider:string,control:RemoteReadControl):RemoteReadControl {
 return {
  account:control.account,
  before:async()=>{
   const row=await env.DB.prepare('SELECT until_at FROM iw_remote_limits WHERE provider=?').bind(provider).first<{until_at:number}>()
   if(row&&row.until_at>Date.now())throw new ApiRateLimit(Math.ceil((row.until_at-Date.now())/1000))
   await control.before?.()
  },
  response:async response=>{
   const remaining=response.headers.get('x-ratelimit-remaining'),reset=Number(response.headers.get('x-ratelimit-reset')),retry=response.headers.get('retry-after')
   let until=0
   if(remaining!==null&&Number(remaining)<=0)until=Number.isFinite(reset)&&reset*1000>Date.now()?reset*1000:Date.now()+3600_000
   if(response.status===429){const seconds=Number(retry),date=Date.parse(retry??'');until=Math.max(until,Number.isFinite(seconds)&&seconds>0?Date.now()+seconds*1000:Number.isFinite(date)&&date>Date.now()?date:Date.now()+3600_000)}
   if(until)await env.DB.prepare('INSERT INTO iw_remote_limits VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET until_at=max(until_at,excluded.until_at)').bind(provider,until).run()
   await control.response?.(response)
  },
 }
}
