import {readFile} from 'node:fs/promises'
import {testExample} from './test-mode-flow.mjs'
await testExample(process.env.INKWELL_ORIGIN,process.env.INKWELL_TEST_KEY,JSON.parse(await readFile(process.argv[2],'utf8')),process.env.INKWELL_TEMPLATE_ID)
console.log('JavaScript test-mode example passed')
