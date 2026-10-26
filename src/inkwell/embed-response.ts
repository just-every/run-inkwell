import { operatorAuth } from '../auth.server'
import { insist, object, Refusal, secret, sha256, type Env } from './model'
import { unseal } from './seal'
import { atomic } from './storage'
import { ApiRateLimit } from './api-limits'
import { embedLaunch, embedCookie, embedGuard, embedAudit, checkEmbed, type Launch } from './embedding'
import { embedLimit } from './embed-limits'
import { embeddedDatabase } from './embed-database'

/** A narrow adapter reuses native handlers with live embedding authority fenced around every write. */
export async function embedResponse(request:Request,env:Env,serve:(request:Request,scope:Env)=>Promise<Response>):Promise<Response|null>{
 const url=new URL(request.url),entry=/^\/embed\/([a-f0-9]{64})$/.exec(url.pathname),api=/^\/api\/embed\/([a-f0-9]{64})(\/.*)$/.exec(url.pathname)
 if(!entry&&!api)return null
 let auditLaunch:Launch|undefined
 const privateHeaders={'cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"frame-ancestors 'none'"}
 try{
  let id=(entry??api)![1]
  if(entry){
   insist(request.method==='GET','Use GET to open an embedded session.',405)
   const existing=await env.DB.prepare('SELECT 1 FROM iw_embed_launches WHERE session_id=?').bind(id).first()
   if(!existing){
    await embedLimit(env,'redeem',await sha256(request.headers.get('cf-connecting-ip')??'unavailable'))
    const launch=await embedLaunch(env,id);auditLaunch=launch
    insist(launch.redeemed_at===null,'This launch was already used. Ask for a fresh launch.',403)
    const session=secret(),cookie=secret()
    await atomic(env.DB,[embedGuard(launch),{sql:'EXISTS(SELECT 1 FROM iw_embed_launches WHERE token_hash=? AND redeemed_at IS NULL)',values:[launch.token_hash]}],[
     env.DB.prepare('UPDATE iw_embed_launches SET session_id=?,session_hash=?,redeemed_at=? WHERE token_hash=?').bind(session,await sha256(cookie),Date.now(),launch.token_hash),
     embedAudit(env,launch.actor,'launch.redeemed',launch.origin,{purpose:launch.mode,grantVersion:launch.grant_version,launch:launch.token_hash,outcome:'allowed'},launch.envelope_id)
    ])
    return new Response(null,{status:303,headers:{...privateHeaders,location:'/embed/'+session,'set-cookie':embedCookie(session,cookie,launch.expires_at),'content-security-policy':`frame-ancestors ${launch.origin}`}})
   }
   const launch=await embedLaunch(env,id,true),response=await serve(request,env),headers=new Headers(response.headers)
   headers.set('content-security-policy',`frame-ancestors ${launch.origin}`);headers.set('referrer-policy','no-referrer');headers.set('cache-control','no-store')
   return new Response(response.body,{status:response.status,headers})
  }
  const launch=await embedLaunch(env,id,true);auditLaunch=launch
  await embedLimit(env,'request',id)
  insist(new URL(env.AUTH_ORIGIN).origin===url.origin,'Use the application origin.',403)
  insist(request.headers.get('sec-fetch-site')!=='cross-site','Cross-site API access is refused.',403)
  if(request.method!=='GET')insist(request.headers.get('origin')===url.origin,'Use the embedded application page.',403)
  const cookie=(request.headers.get('cookie')??'').split(';').map(c=>c.trim()).find(c=>c.startsWith(`inkwell_embed_${id.slice(0,16)}=`))?.split('=')[1]
  insist(cookie&&await sha256(cookie)===launch.session_hash,'Browser cookie custody is unavailable. Continue in Inkwell or ask for a fresh launch.',401)
  insist(!request.headers.has('authorization'),'Bearer credentials cannot use embedded sessions.',403)
  const credential=await unseal(env,'embed-launch',launch.token_hash,launch.sealed)
  insist(credential,'Embedded session cannot be opened.',403)
  const scope={...env,embedProvenance:{origin:launch.origin,purpose:launch.mode,grantVersion:launch.grant_version,launch:launch.token_hash},DB:embeddedDatabase(env.DB,()=>embedGuard(launch)),...(launch.mode==='prepare'?{embedAllocation:launch.allocation}:{})}
  const headers=new Headers(request.headers);if(launch.mode==='prepare')headers.set('cookie',credential)
  const path=api![2]
  if(path==='/close'){
   insist(request.method==='POST','Use POST to close a session.',405)
   await atomic(env.DB,[embedGuard(launch)],[env.DB.prepare('DELETE FROM iw_embed_launches WHERE token_hash=?').bind(launch.token_hash),embedAudit(env,launch.actor,'launch.closed',launch.origin,{purpose:launch.mode,grantVersion:launch.grant_version,launch:launch.token_hash,outcome:'closed'},launch.envelope_id)])
   return Response.json({closed:true},{headers:privateHeaders})
  }
  if(path==='/meta')return Response.json({mode:launch.mode,origin:launch.origin,envelopeId:launch.mode==='prepare'?launch.envelope_id:null,...(launch.mode==='sign'?{token:credential}:{})},{headers:privateHeaders})
  let proxyRequest=request,target:string
  if(launch.mode==='sign'){
   insist(path==='/api/sign/'+credential||path.startsWith('/api/sign/'+credential+'/'),'This session opens only its recipient request.',403)
   target=path
  }else{
   const session=await operatorAuth(scope).getSession(new Request(request.url,{headers}))
   insist(session&&['owner','admin'].includes(session.operator.role),'The authorizing member session ended.',401)
   const reads=['/api/inkwell','/api/inkwell/envelope-defaults','/api/inkwell/freeform-policy','/api/inkwell/signing-groups','/api/inkwell/contacts','/api/inkwell/templates']
   const writes=['/api/inkwell/documents/fields','/api/inkwell/templates/match','/api/inkwell/documents/uploads']
   const own=launch.envelope_id&&path==='/api/inkwell/envelopes/'+launch.envelope_id
   insist((request.method==='GET'&&(reads.includes(path)||own))||(request.method==='POST'&&writes.includes(path))||(request.method==='POST'&&path==='/api/inkwell/commands')||(request.method==='PUT'&&/^\/api\/inkwell\/documents\/uploads\/[^/]+\/parts\/\d+$/.test(path)),'This embedded session permits preparation and explicit sending only.',403)
   if(path==='/api/inkwell/commands'){
    const body=object(await request.clone().json()),input=object(body.input)
    if(body.command==='envelope.prepare'){
     if(launch.envelope_id)return Response.json({ok:true,result:{id:launch.envelope_id}},{headers:privateHeaders})
     body.commandId='embed-'+launch.token_hash;headers.delete('content-length');proxyRequest=new Request(request,{body:JSON.stringify(body)})
    }
    insist(body.command==='envelope.prepare'||(['envelope.update','envelope.approve'].includes(String(body.command))&&input.id===launch.envelope_id),'This session can change only its own prepared envelope.',403)
   }
   target=path
  }
  url.pathname=target
  const response=await serve(new Request(url,new Request(proxyRequest,{headers})),scope),out=new Headers(response.headers)
  await checkEmbed(env,launch)
  if(launch.mode==='prepare'&&response.ok){
   if(path==='/api/inkwell')return Response.json({signingGroups:[]},{headers:privateHeaders})
   if(path==='/api/inkwell/commands'){
    const result=await response.clone().json() as {result?:{id?:string}}
    if(!launch.envelope_id&&result.result?.id)await scope.DB.prepare('UPDATE iw_embed_launches SET envelope_id=? WHERE token_hash=? AND envelope_id IS NULL').bind(result.result.id,launch.token_hash).run()
   }
   const member=await operatorAuth(scope).getSession(new Request(request.url,{headers}))
   if(member)await scope.DB.prepare(`INSERT INTO iw_member_access(operator_id,last_access_at) VALUES(?,?) ON CONFLICT(operator_id) DO UPDATE SET last_access_at=MAX(iw_member_access.last_access_at,excluded.last_access_at)`).bind(member.operator.id,new Date().toISOString()).run()
  }
  if(launch.mode==='sign'&&out.has('set-cookie'))out.set('set-cookie',out.get('set-cookie')!.replace('Path=/api/sign/','Path=/api/embed/'+id+'/api/sign/').replace('SameSite=Strict','SameSite=None; Secure; Partitioned'))
  out.set('cache-control','no-store');out.set('referrer-policy','no-referrer')
  return new Response(response.body,{status:response.status,headers:out})
 }catch(error){
  if(auditLaunch)await embedAudit(env,auditLaunch.actor,'request.refused',auditLaunch.origin,{purpose:auditLaunch.mode,grantVersion:auditLaunch.grant_version,launch:auditLaunch.token_hash,outcome:'refused',status:error instanceof Refusal?error.status:500},auditLaunch.envelope_id).run()
  const status=error instanceof Refusal?error.status:500
  if(entry)return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/shell.css"><title>Inkwell · Embedded session</title><body class="iw-app iw-signer"><main class="iw-main"><h1>Embedded session unavailable</h1><p>This launch expired, was already used, or its authorization ended. Ask for a fresh launch.</p><a href="/app" target="_blank" rel="noreferrer">Continue in Inkwell</a></main></body></html>',{status,headers:{...privateHeaders,'content-type':'text/html; charset=utf-8',...(error instanceof ApiRateLimit?{'retry-after':String(error.retryAfter)}:{})}})
  return Response.json({error:error instanceof Refusal?error.message:'Embedded session could not be opened. Continue in Inkwell or ask for a fresh launch.'},{status,headers:{...privateHeaders,...(error instanceof ApiRateLimit?{'retry-after':String(error.retryAfter)}:{})}})
 }
}
