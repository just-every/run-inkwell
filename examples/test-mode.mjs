import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Inkwell} from '../sdk/javascript/index.mjs'
if(!process.env.INKWELL_TEST_KEY?.startsWith('iwk_test_'))throw Error('Use a test-mode key.')
const client=new Inkwell({origin:process.env.INKWELL_ORIGIN,key:process.env.INKWELL_TEST_KEY})
const definition=JSON.parse(await readFile(process.argv[2],'utf8'))
const {result}=await client.create(definition)
assert.equal((await client.get(result.id)).envelope.testMode,true)
assert.ok((await client.artifact(result.id,'original')).length>0)
assert.ok((await client.list()).envelopes.some(e=>e.id===result.id))
await client.send(result.id);await client.correct(result.id,{signers:[{...definition.signers[0],email:'synthetic.corrected@clients.example'}]});await client.resend(result.id,{signer:0});await client.templates();await client.openapi();await client.void(result.id,'Synthetic example complete')
console.log('JavaScript test-mode example passed')
