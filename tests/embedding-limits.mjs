import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

export async function embeddingLimitCases(){
 const start=Date.UTC(2026,9,26,12),h=await harness({now:start}),origin='https://portal.harbour.example',base='/api/inkwell'
 try{
  await h.post(base+'/embed-origins',{origin,enabled:true,consent:true})
  const members=[h.owner];for(let i=1;i<6;i++)members.push(await h.invite(`limit-admin-${i}@harbour.example`,'admin'))
  const launches=[]
  for(let member=0;member<5;member++){
   for(let i=0;i<59;i++)launches.push((await h.post(base+'/embeds',{origin,mode:'prepare',consent:true},members[member])).value.url)
   const race=await Promise.all(Array.from({length:3},()=>h.send(base+'/embeds',{origin,mode:'prepare',consent:true},members[member])))
   assert.equal(race.filter(r=>r.status===200).length,1,'concurrent issuance admits only the remaining member allowance')
   for(const response of race.filter(r=>r.status===429))assert.ok(Number(response.headers.get('retry-after'))>0)
   launches.push(race.find(r=>r.status===200).value.url)
  }
  const full=await h.send(base+'/embeds',{origin,mode:'prepare',consent:true},members[5]);assert.equal(full.status,429,'installation allowance cannot be reset with another member');assert.ok(Number(full.headers.get('retry-after'))>0)
  let session
  for(let address=0;address<5;address++){
   for(let i=0;i<60;i++){
    const r=await h.send(new URL(launches[address*60+i]).pathname,undefined,'',{'cf-connecting-ip':`192.0.2.${address+1}`});assert.equal(r.status,303)
    session??={id:r.headers.get('location').split('/').at(-1),cookie:r.cookie}
   }
   const denied=await h.send('/embed/'+'a'.repeat(64),undefined,'',{'cf-connecting-ip':`192.0.2.${address+1}`});assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0)
  }
  const global=await h.send('/embed/'+'a'.repeat(64),undefined,'',{'cf-connecting-ip':'192.0.2.100'});assert.equal(global.status,429,'installation redemption allowance applies across connecting addresses')
  for(let i=0;i<599;i++)assert.equal((await h.send('/api/embed/'+session.id+'/meta',undefined,session.cookie)).status,200)
  const concurrent=await Promise.all(Array.from({length:3},()=>h.send('/api/embed/'+session.id+'/meta',undefined,session.cookie)))
  assert.equal(concurrent.filter(r=>r.status===200).length,1,'concurrent requests share one rolling allowance')
  assert.ok(concurrent.filter(r=>r.status===429).every(r=>Number(r.headers.get('retry-after'))>0))
  assert.equal((await h.send('/api/inkwell/envelopes',undefined,h.owner)).value.total,0,'limits create no envelope or invitation')
  assert.equal(await h.mail('limit-admin-1@harbour.example','Please sign:'),undefined)
  h.advanceTo(start+60_000)
  assert.equal((await h.send('/api/embed/'+session.id+'/meta',undefined,session.cookie)).status,200,'rolling request allowance recovers at the boundary')
  assert.equal((await h.send(base+'/embeds',{origin,mode:'prepare',consent:true},h.owner)).status,200,'issuance allowance recovers without extending an older session')
  console.log('Embedded limits: concurrent member and installation issuance, address and installation redemption, session requests, Retry-After, recovery and no side effects passed.')
 }finally{await h.close()}
}
if(process.argv[1]?.endsWith('/embedding-limits.mjs'))await embeddingLimitCases()
