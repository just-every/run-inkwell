import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

// The paid mail edge, faked per provider: each accepted message is captured as {to, subject, text}. DELIV-001: SendGrid
// messages keep their custom_args (rer_delivery_id), Resend and SendGrid return a message id, and failSends(n) makes the
// next n requests answer 500, which the provider adapters classify as uncertain.
const edges = {
 'api.resend.com': async request => { const body = await request.json(), id = crypto.randomUUID(); return [{ ...body, id }, Response.json({ id })] },
 'api.sendgrid.com': async request => { const body = await request.json(), id = crypto.randomUUID().replaceAll('-', '').slice(0, 22); return [{ to: body.personalizations.flatMap(p => p.to.map(t => t.email)), subject: body.subject, text: body.content.find(c => c.type === 'text/plain')?.value, customArgs: body.custom_args, id }, new Response(null, { status: 202, headers: { 'x-message-id': id } })] },
 'api.cloudflare.com': async request => { const body = await request.json(); return [body, Response.json({ success: true, errors: [], messages: [], result: { delivered: body.to, permanent_bounces: [], queued: [] } })] },
}
// DELIV-008: the chat edges, faked by host: each accepted post is captured as {channel, path, body}. Nook's stands in for
// a Nook installation's Slack-compatible incoming webhook (NOOK-063), which answers like Slack's.
const hooks = { 'hooks.slack.com': 'slack', 'harbour.webhook.office.com': 'teams', 'nook.harbour.example': 'nook' }
export async function harness({ mailProvider = 'resend', bindings = {} } = {}) {
 const socket = createServer(); await new Promise(r => socket.listen(0,'127.0.0.1',r)); const port = socket.address().port; await new Promise(r => socket.close(r))
 const origin = `http://127.0.0.1:${port}`, directory = await mkdtemp(join(tmpdir(),'inkwell-test-'))
 const bundle = await build({entryPoints:['tests/api-worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],target:'es2023'})
 const bootstrapToken = randomBytes(32).toString('hex')
 const inbound = new Map(), inboundAttachments = new Map()
 const capturedMail = [], attempts = [], posts = [], logs = []
 let failing = 0
 const mf = new Miniflare({...convertV4MiniflareOptions({handleStructuredLogs:entry=>logs.push(entry.message),host:'127.0.0.1',port,outboundService:async request=>{ const inboundPath=new URL(request.url).pathname; if(new URL(request.url).hostname==='attachments.harbour.example'){const item=inboundAttachments.get(inboundPath.slice(1));return item?new Response(item.bytes):new Response(null,{status:404})} if(request.method==='GET'&&inboundPath.includes('/attachments/')){const item=inboundAttachments.get(inboundPath.split('/').at(-1));return item?Response.json(item.metadata):new Response(null,{status:404})} if(request.method==='GET'&&new URL(request.url).hostname==='api.resend.com'&&inboundPath.startsWith('/emails/receiving/')){const message=inbound.get(inboundPath.split('/')[3]);return message?Response.json(message):new Response('not found',{status:404})} const hook=hooks[new URL(request.url).hostname]; if(hook){ posts.push({channel:hook,path:new URL(request.url).pathname,body:await request.json()}); return new Response(hook==='teams'?'1':'ok') } const edge=edges[new URL(request.url).hostname]; if(!edge) throw new Error('Unexpected test network request'); const [message,response]=await edge(request); attempts.push(message); if(failing>0){failing--;return new Response('provider unavailable',{status:500})} capturedMail.push(message); return response },modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'inkwell'},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@harbour.example',SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:bootstrapToken,...(mailProvider ? {MAIL_PROVIDER:mailProvider} : {}),MAIL_API_KEY:'test-mail-edge',MAIL_FROM:'Inkwell <inkwell@harbour.example>',...(mailProvider==='cloudflare'?{MAIL_ACCOUNT_ID:'0123456789abcdef0123456789abcdef'}:{}),...bindings}}),resourcePersistencePath:directory})
 try {
  const db = await mf.getD1Database('DB')
  for(const file of (await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/'+file,'utf8')).map(sql=>db.prepare(sql)))
  const send = async (path,body,cookie='',headers={}) => {
   const response = await mf.dispatchFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'})
   const bytes = new Uint8Array(await response.arrayBuffer()), text = new TextDecoder().decode(bytes)
   let value; try{value=JSON.parse(text)}catch{value=text}
   return {status:response.status,value,bytes,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const bootstrap = await send('/auth/bootstrap',{token:bootstrapToken,displayName:'Harbour Owner'})
  assert.equal(bootstrap.status,303,'native owner bootstrap succeeds')
  const owner = bootstrap.cookie
  const post = async(path,body,cookie=owner,status=200,headers={})=>{const r=await send(path,body,cookie,headers);assert.equal(r.status,status,`${path.replace(/\/sign\/[^/]+/,'/sign/[private]')}: ${typeof r.value==='object'?JSON.stringify(r.value):'unexpected response'}`);return r}
  const command=async(command,input={},cookie=owner,status=200,commandId=crypto.randomUUID())=> (await post('/api/inkwell/commands',{command,input,commandId},cookie,status)).value
  const mail=async(email,kind)=>{
   return [...capturedMail].reverse().find(m=>m.to.includes(email)&&(!kind||m.subject.includes(kind)))
  }
  const invite=async(email,role)=>{
   await post('/auth/invite',{email,displayName:email.split('@')[0],role},owner,202)
   const message=await mail(email),token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
   return (await post('/auth/confirm',{token},'',303)).cookie
  }
  // SIGNX-005: a verified signer agrees to the current disclosure before opening or signing the document.
  const agree=async(path,cookie)=>(await post(path+'/disclosure',{version:(await send(path,undefined,cookie)).value.disclosure.version,agree:true},cookie)).value.result
  // The worker's scheduled handler, run as if the cron fired at `at` (DELIV-004 expiry warnings).
  const scheduled=async at=>{const result=await (await mf.getWorker()).scheduled({scheduledTime:new Date(at),cron:'17 * * * *'});assert.equal(result.outcome,'ok','the scheduled pass succeeds')}
  // How many messages the mail edge has received so far.
  const sent=()=>capturedMail.length
  // DELIV-001: every request the mail edge received, including ones it failed, and failing the next n.
  const attempted=()=>[...attempts],failSends=n=>{failing=n}
  return {mf,db,origin,owner,attachment:(id,item)=>inboundAttachments.set(id,item),inbound:message=>inbound.set(message.id,message),logs:()=>[...logs],send,post,command,mail,invite,agree,scheduled,sent,attempted,failSends,posts:()=>[...posts],async close(){await mf.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(e){await mf.dispose();await rm(directory,{recursive:true,force:true});throw e}
}
