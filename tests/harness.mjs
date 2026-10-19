import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

export async function harness({ mailProvider = 'resend' } = {}) {
 const socket = createServer(); await new Promise(r => socket.listen(0,'127.0.0.1',r)); const port = socket.address().port; await new Promise(r => socket.close(r))
 const origin = `http://127.0.0.1:${port}`, directory = await mkdtemp(join(tmpdir(),'inkwell-test-'))
 const bundle = await build({entryPoints:['tests/api-worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],target:'es2023'})
 const bootstrapToken = randomBytes(32).toString('hex')
 const capturedMail = []
 const mf = new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port,outboundService:async request=>{ if(new URL(request.url).hostname!=='api.resend.com') throw new Error('Unexpected test network request'); capturedMail.push(await request.json()); return Response.json({id:crypto.randomUUID()}) },modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'inkwell'},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@harbour.example',SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:bootstrapToken,...(mailProvider ? {MAIL_PROVIDER:mailProvider} : {}),MAIL_API_KEY:'test-mail-edge',MAIL_FROM:'Inkwell <inkwell@harbour.example>'}}),resourcePersistencePath:directory})
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
  return {mf,db,origin,owner,send,post,command,mail,invite,agree,scheduled,sent,async close(){await mf.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(e){await mf.dispose();await rm(directory,{recursive:true,force:true});throw e}
}
