import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// The existing CI matrix owns disjoint file partitions. An ordinary local run
// still executes the complete API suite once.
const selector = process.env.INKWELL_JOURNEY_SHARD
if (selector && !/^[1234]\/4$/.test(selector)) throw new Error('Choose one of the four verification shards.')
const files = (await readdir(new URL('.', import.meta.url))).filter(file => file.endsWith('.test.mjs')).sort().map(file => fileURLToPath(new URL(file, import.meta.url)))
console.log(`API tests ${selector ?? 'all'}`)
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...(selector ? ['--test-shard=' + selector] : []), ...process.argv.slice(2), ...files], { stdio: 'inherit', env: process.env })
if (result.error) throw result.error
if (result.signal) throw new Error(`API tests ended with signal ${result.signal}`)
process.exitCode = result.status ?? 1
