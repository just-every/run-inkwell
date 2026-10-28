import { ApiRateLimit } from './api-limits'
import type { Env } from './model'
import type { RemoteReadControl } from './remote-import-provider'

/** Every import door shares the provider window; account review retries cannot reset it. */
export function remoteReadControl(env:Env,provider:string,control:RemoteReadControl):RemoteReadControl {
 return {
  ...control,
  before:async()=>{
   const at=Date.now(),row=await env.DB.prepare('SELECT until_at FROM iw_remote_limits WHERE provider=?').bind(provider).first<{until_at:number}>()
   if(row&&row.until_at>at)throw new ApiRateLimit(Math.ceil((row.until_at-at)/1000))
   await control.before?.()
   if(provider==='dropbox') {
    await env.DB.prepare('INSERT OR IGNORE INTO iw_remote_read_windows VALUES(?,?,?,?)').bind(provider,at+60000,100,100).run()
    await env.DB.prepare('UPDATE iw_remote_read_windows SET reset_at=?,remaining=quota WHERE provider=? AND reset_at<=?').bind(at+60000,provider,at).run()
    const reserved=await env.DB.prepare('UPDATE iw_remote_read_windows SET remaining=remaining-1 WHERE provider=? AND remaining>0 RETURNING reset_at').bind(provider).first<{reset_at:number}>()
    if(!reserved){const window=await env.DB.prepare('SELECT reset_at FROM iw_remote_read_windows WHERE provider=?').bind(provider).first<{reset_at:number}>();throw new ApiRateLimit(Math.max(1,Math.ceil((window!.reset_at-at)/1000)))}
   }
  },
  response:async response=>{
   const remaining=response.headers.get('x-ratelimit-limit-remaining')??response.headers.get('x-ratelimit-remaining'),reset=Number(response.headers.get('x-ratelimit-reset')),retry=response.headers.get('retry-after'),limit=Number(response.headers.get('x-ratelimit-limit'))
   const at=Date.now(),validRemaining=remaining!==null&&Number.isSafeInteger(Number(remaining))&&Number(remaining)>=0
   if(provider==='dropbox') {
    if(Number.isSafeInteger(limit)&&limit>0)await env.DB.prepare('UPDATE iw_remote_read_windows SET quota=? WHERE provider=?').bind(Math.min(100,limit),provider).run()
    if(validRemaining)await env.DB.prepare('UPDATE iw_remote_read_windows SET remaining=min(remaining,?),reset_at=CASE WHEN ?>? THEN ? ELSE reset_at END WHERE provider=?').bind(Number(remaining),(Number.isFinite(reset)?reset*1000:0),at,(Number.isFinite(reset)?reset*1000:0),provider).run()
   }
   let until=0
   if(validRemaining&&Number(remaining)===0)until=Number.isFinite(reset)&&reset*1000>at?reset*1000:at+3600_000
   if(response.status===429){const seconds=Number(retry),date=Date.parse(retry??'');until=Math.max(until,Number.isFinite(seconds)&&seconds>0?at+seconds*1000:Number.isFinite(date)&&date>at?date:at+3600_000)}
   if(until)await env.DB.prepare('INSERT INTO iw_remote_limits VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET until_at=max(until_at,excluded.until_at)').bind(provider,until).run()
   await control.response?.(response)
  },
 }
}
