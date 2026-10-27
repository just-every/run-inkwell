// Incrementally migrate legacy acceptance entries while preserving other clauses' recorded journeys.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseContract } from '../src/base/seed-contract.mjs'

const [mode, ...selected] = process.argv.slice(2)
if (!['write','check'].includes(mode) || !selected.length) throw new Error('Choose write or check followed by the clause IDs being reconciled.')
const source=readFileSync('CONTRACT.md','utf8'),contract=parseContract(source),lines=source.split('\n')
let acceptance=readFileSync('ACCEPTANCE.md','utf8')
for(const id of selected){
 const clause=contract.clauses.find(clause=>clause.id===id)
 if(!clause)throw new Error(`Unknown clause ${id}`)
 const cells=lines[clause.row-1].trim().slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim())
 const point=clause.text.split('**Acceptance evidence:**')[1]?.trim()
 if(!point)throw new Error(`The acceptance journey for ${id} must be in CONTRACT.md before regeneration.`)
 const prefix=`- **${id} — `,current=acceptance.split('\n').find(line=>line.startsWith(prefix))
 if(!current)throw new Error(`No legacy acceptance entry for ${id}`)
 const replacement=`- **${id} — ${clause.title}** (${clause.status}). ${point[0].toUpperCase()+point.slice(1)} Evidence: ${cells[4]}.`+(cells[5]?` Gap: ${cells[5]}`:'')
 acceptance=acceptance.replace(current,replacement)
}
const claims=['# Clause claims','','Generated from CONTRACT.md. Acceptance journeys remain in ACCEPTANCE.md.','',`Inventory: ${contract.counts.done} done, ${contract.counts.partial} partial, ${contract.counts.missing} missing; ${contract.counts.total} total.`,'','| Clause | Status | Evidence | Gap |','| --- | --- | --- | --- |',...contract.clauses.map(clause=>{const cells=lines[clause.row-1].trim().slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim());return `| ${cells[0]} | ${cells[3]} | ${cells[4]} | ${cells[5]} |`})].join('\n')+'\n'
for(const [path,output] of [['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
 if(mode==='write')writeFileSync(path,output)
 else if(readFileSync(path,'utf8')!==output)throw new Error(`Regenerate ${path} from CONTRACT.md.`)
}
console.log(`Contract docs ${mode}: ${selected.join(', ')}; ${contract.counts.total} claims`)
