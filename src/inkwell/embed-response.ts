import { operatorAuth } from '../auth.server'
import { insist, object, Refusal, type Env } from './model'
import { unseal } from './seal'
import { embedLaunch, embedCookie } from './embedding'

// A narrow adapter reuses the real recipient and member handlers. No parent command channel exists.
export async function embedResponse(request:Request,env:Env,serve:(request:Request)=>Promise<Response>):Promise<Response|null>{
 const url=new URL(request.url),entry=/^\/embed\/([a-f0-9]{64})$/.exec(url.pathname),api=/^\/api\/embed\/([a-f0-9]{64})(\/.*)$/.exec(url.pathname)
 if(!entry&&!api)return null
 try{
  const id=(entry??api)![1],launch=await embedLaunch(env,id)
  if(entry){
   insist(request.method==='GET','Use GET to open an embedded session.',405)
   const response=await serve(request),headers=new Headers(response.headers)
   headers.set('content-security-policy',`frame-ancestors ${launch.origin}`);headers.set('referrer-policy','no-referrer');headers.set('cache-control','no-store');headers.append('set-cookie',embedCookie(env,id))
   return new Response(response.body,{status:response.status,headers})
  }
  insist(new URL(env.AUTH_ORIGIN).origin===url.origin,'Use the application origin.',403)
  insist(request.headers.get('sec-fetch-site')!=='cross-site','Cross-site API access is refused.',403)
  if(request.method!=='GET')insist(request.headers.get('origin')===url.origin,'Use the embedded application page.',403)
  insist((request.headers.get('cookie')??'').split(';').some(c=>c.trim()===`inkwell_embed_${id.slice(0,16)}=${id}`),'Open the embedded session first.',401)
  const credential=await unseal(env,'embed-launch',launch.token_hash,launch.sealed)
  insist(credential,'Embedded session cannot be opened.',403)
  insist(!request.headers.has('authorization'),'Bearer credentials cannot use embedded sessions.',403)
  const headers=new Headers(request.headers);if(launch.mode==='prepare')headers.set('cookie',credential)
  let proxyRequest=request
  const path=api![2]
  if(path==='/close'){insist(request.method==='POST','Use POST to close a session.',405);await env.DB.batch([env.DB.prepare('DELETE FROM iw_embed_launches WHERE token_hash=?').bind(launch.token_hash),env.DB.prepare('INSERT INTO iw_embed_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),launch.actor,'launch.closed',launch.origin,new Date().toISOString())]);return Response.json({closed:true},{headers:{'cache-control':'no-store'}})}
  if(path==='/meta'&&launch.mode==='prepare')insist(await operatorAuth(env).getSession(new Request(request.url,{headers})),'The authorizing member session ended.',401)
  if(path==='/meta')return Response.json({mode:launch.mode,origin:launch.origin,envelopeId:launch.envelope_id,...(launch.mode==='sign'?{token:credential}:{})},{headers:{'cache-control':'no-store'}})
  let target:string
  if(launch.mode==='sign'){
   insist(path.startsWith('/api/sign/'+credential)&& (path==='/api/sign/'+credential||path.startsWith('/api/sign/'+credential+'/')),'This session opens only its recipient request.',403)
   target=path
  }else{
   const session=await operatorAuth(env).getSession(new Request(request.url,{headers}))
   insist(session&&['owner','admin'].includes(session.operator.role),'The authorizing member session ended.',401)
   headers.set('cookie',credential)
   const read=['/api/inkwell','/api/inkwell/envelope-defaults','/api/inkwell/freeform-policy','/api/inkwell/signing-groups','/api/inkwell/contacts','/api/inkwell/templates']
   const writes=['/api/inkwell/documents/fields','/api/inkwell/templates/match','/api/inkwell/documents/uploads']
   const own=launch.envelope_id&&path==='/api/inkwell/envelopes/'+launch.envelope_id
   insist((request.method==='GET'&&(read.includes(path)||own))||(request.method==='POST'&&writes.includes(path))||path==='/api/inkwell/commands'||/^\/api\/inkwell\/documents\/uploads\/[^/]+\/parts\/\d+$/.test(path),'This embedded session permits preparation and explicit sending only.',403)
   if(path==='/api/inkwell/commands'){
    const body=object(await request.clone().json()),input=object(body.input)
    if(body.command==='envelope.prepare'){body.commandId='embed-'+launch.token_hash;headers.delete('content-length');proxyRequest=new Request(request,{body:JSON.stringify(body)})}
    insist(body.command==='envelope.prepare'||(['envelope.update','envelope.approve'].includes(String(body.command))&&input.id===launch.envelope_id),'This session can change only its own prepared envelope.',403)
   }
   target=path
  }
  url.pathname=target
  const response=await serve(new Request(url, new Request(proxyRequest,{headers}))),out=new Headers(response.headers)
  if(launch.mode==='prepare'&&path==='/api/inkwell'&&response.ok){const body=await response.json() as {signingGroups?:unknown};return Response.json({signingGroups:body.signingGroups??[]},{headers:{'cache-control':'no-store'}})}
  if(launch.mode==='prepare'&&path==='/api/inkwell/commands'&&response.ok){
   const result=await response.clone().json() as {result?:{id?:string}}
   if(!launch.envelope_id&&result.result?.id)await env.DB.prepare('UPDATE iw_embed_launches SET envelope_id=? WHERE token_hash=? AND envelope_id IS NULL').bind(result.result.id,launch.token_hash).run()
  }
  if(launch.mode==='sign'){
   const set=out.get('set-cookie')
   if(set){out.set('set-cookie',set.replace('Path=/api/sign/','Path=/api/embed/'+id+'/api/sign/').replace('SameSite=Strict',new URL(env.AUTH_ORIGIN).protocol==='https:'?'SameSite=None; Partitioned':'SameSite=None; Secure; Partitioned'))}
  }
  out.set('cache-control','no-store')
  return new Response(response.body,{status:response.status,headers:out})
 }catch(error){return Response.json({error:error instanceof Refusal?error.message:'Embedded session could not be opened.'},{status:error instanceof Refusal?error.status:500,headers:{'content-security-policy':"frame-ancestors 'none'",'cache-control':'no-store'}})}
}
