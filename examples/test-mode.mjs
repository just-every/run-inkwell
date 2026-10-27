import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {Inkwell} from '../sdk/javascript/index.mjs'

export async function testExample(origin,key,definition,templateId){
 assert.ok(key.startsWith('iwk_test_'),'Use a test-mode key.')
 const client=new Inkwell({origin,key})
 const templates=await client.templates()
 assert.deepEqual(templates.templates.map(t=>t.id),[templateId],'SDK returns the known visible template')
 const spec=await client.openapi()
 assert.match(spec.openapi,/^3\./)
 const operations=[['listEnvelopes','get'],['prepareEnvelope','post'],['readEnvelope','get'],['downloadArtifact','get'],['listTemplates','get'],['sendEnvelope','post'],['correctEnvelope','post'],['resendInvitation','post'],['voidEnvelope','post']]
 const paths={}
 for(const [name,method] of operations){
  const entries=Object.entries(spec.paths).filter(([,verbs])=>verbs[method]?.operationId===name)
  assert.equal(entries.length,1,`OpenAPI describes usable ${name}`)
  const [path,verbs]=entries[0]
  assert.ok(verbs[method].responses['200'])
  paths[name]=path
 }
 assert.deepEqual((await client.request(paths.listTemplates)).templates.map(t=>t.id),[templateId],'OpenAPI template operation works')
 const {result}=await client.create(definition)
 const read=async()=> (await client.get(result.id)).envelope
 assert.equal((await read()).testMode,true)
 assert.ok((await client.artifact(result.id,'original')).length>0)
 assert.ok((await client.list()).envelopes.some(e=>e.id===result.id))
 assert.ok((await client.request(paths.listEnvelopes)).envelopes.some(e=>e.id===result.id),'OpenAPI list operation works')
 await client.send(result.id)
 assert.equal((await read()).status,'awaiting_signature')
 await client.correct(result.id,{signers:[{...definition.signers[0],email:'synthetic.corrected@clients.example'}]})
 assert.equal((await read()).signers[0].email,'synthetic.corrected@clients.example')
 const before=(await read()).events.filter(e=>e.action==='signer.resent').length
 await client.resend(result.id,{signer:0})
 assert.equal((await read()).events.filter(e=>e.action==='signer.resent').length,before+1)
 await client.void(result.id,'Synthetic example complete')
 const envelope=await read()
 assert.equal(envelope.status,'voided')
 return envelope
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 await testExample(process.env.INKWELL_ORIGIN,process.env.INKWELL_TEST_KEY,JSON.parse(await readFile(process.argv[2],'utf8')),process.env.INKWELL_TEMPLATE_ID)
 console.log('JavaScript test-mode example passed')
}
