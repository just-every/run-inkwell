// Technical qualification runner. Results are private artifacts, never a validation claim.
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
const args=process.argv.slice(2), options={}
for(let i=0;i<args.length;i+=2){if(!['--phase','--installed-version','--output','--since-validated'].includes(args[i])||!args[i+1])throw new Error('Use --phase iq|oq|pq|all --installed-version FULL_SHA --output ABSOLUTE_PRIVATE_DIRECTORY [--since-validated FULL_SHA]');options[args[i].slice(2)]=args[i+1]}
const run=(command,args)=>spawnSync(command,args,{encoding:'utf8',env:process.env,maxBuffer:32*1024*1024})
const git=(...args)=>{const r=run('git',args);if(r.status!==0)throw new Error('Cannot read candidate Git metadata');return r.stdout.trim()}
const head=git('rev-parse','HEAD'),root=await realpath(git('rev-parse','--show-toplevel')),phase=options.phase??'all'
if(!['iq','oq','pq','all'].includes(phase)||!/^[a-f0-9]{40}$/.test(options['installed-version']??'')||options['installed-version']!==head)throw new Error('Require an explicit exact installed candidate SHA')
if(git('status','--porcelain','--untracked-files=no'))throw new Error('Commit the tracked candidate before qualification')
if(!isAbsolute(options.output??''))throw new Error('Use an absolute private output path outside the repository')
await mkdir(options.output,{recursive:true});const output=await realpath(options.output),path=relative(root,output)
if(!path.startsWith('..')&&!isAbsolute(path))throw new Error('Qualification artifacts cannot be written in the repository')
const started=new Date().toISOString(),runId=started.replace(/[^0-9]/g,'')+'-part11-'+head.slice(0,12),directory=resolve(output,runId)
await mkdir(directory,{recursive:true})
const pkg=JSON.parse(await readFile('package.json','utf8'))
if(process.versions.node!==pkg.engines.node)throw new Error('Use the exact Node version declared in package.json')
const receipt={runId,head,started,qualification:'unvalidated',environment:'candidate emitted Worker with synthetic mail edge; customer installed qualification and procedures pending',phases:[]}
let failed=false
const phases={iq:[process.execPath,['scripts/edition-authoring/cli.mjs','check']],oq:[process.execPath,['--test','tests/compliance.test.mjs']],pq:[process.execPath,['tests/journeys/healthcare.mjs']]}
for(const [name,[command,args]] of Object.entries(phases)){
 if(phase!=='all'&&phase!==name)continue
 if(name==='pq'){const built=run(process.execPath,['node_modules/vite/bin/vite.js','build']);await writeFile(resolve(directory,'build.log'),(built.stdout??'')+(built.stderr??''));if(built.status!==0){receipt.phases.push({name:'pq-build',exitCode:built.status});failed=true;break}}
 const at=new Date().toISOString(),result=spawnSync(command,args,{encoding:'utf8',env:{...process.env,INKWELL_SCREENSHOTS:resolve(directory,'screens')},maxBuffer:32*1024*1024})
 const log=(result.stdout??'')+(result.stderr??'');await writeFile(resolve(directory,name+'.log'),log)
 receipt.phases.push({name,started:at,ended:new Date().toISOString(),command:[command,...args],exitCode:result.status,logSha256:createHash('sha256').update(log).digest('hex')})
 if(result.status!==0){failed=true;break}
}
if(phase==='iq'||phase==='all'){
 const since=options['since-validated']
 if(since&&!/^[a-f0-9]{40}$/.test(since))throw new Error('Use a full previously validated SHA')
 if(since){git('merge-base','--is-ancestor',since,head);await writeFile(resolve(directory,'changes-since-validated.txt'),git('log','--format=%H %s',since+'..'+head)+'\n')}
 else await writeFile(resolve(directory,'changes-since-validated.txt'),'No previously validated version supplied. No qualification baseline is claimed.\n')
 const {readdir}=await import('node:fs/promises'),migrations=[]
 for(const name of (await readdir('migrations/core')).filter(n=>n.endsWith('.sql')).sort()){const bytes=await readFile('migrations/core/'+name);migrations.push({name,sha256:createHash('sha256').update(bytes).digest('hex')})}
 await writeFile(resolve(directory,'installation.json'),JSON.stringify({head,node:process.versions.node,packageManager:pkg.packageManager,migrations},null,2)+'\n')
}
if(git('rev-parse','HEAD')!==head||git('status','--porcelain','--untracked-files=no')){failed=true;receipt.candidateChanged=true}
receipt.ended=new Date().toISOString();receipt.technicalResult=failed?'fail':'pass'
await writeFile(resolve(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n')
await writeFile(resolve(directory,'traceability.md'),await readFile('docs/part11/traceability.md'))
console.log(JSON.stringify({runId,head,technicalResult:receipt.technicalResult,qualification:receipt.qualification,receipt:resolve(directory,'receipt.json')}))
process.exitCode=failed?1:0
