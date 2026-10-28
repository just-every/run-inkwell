import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'

test('Microsoft filing migration preserves main folder identity and unresolved job custody on an existing installation',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-08',d1Databases:{DB:'migration'}}))
 try{
  const db=await mf.getD1Database('DB')
  const apply=async sql=>db.batch(unstable_splitSqlQuery(sql).map(statement=>db.prepare(statement)))
  await apply('CREATE TABLE iw_templates(id TEXT PRIMARY KEY); CREATE TABLE iw_envelopes(id TEXT PRIMARY KEY); CREATE TABLE iw_pdf_uploads(id TEXT PRIMARY KEY);')
  await apply(await readFile('migrations/core/0063_filing.sql','utf8'))
  await apply(await readFile('migrations/core/0079_filing_folder_repair.sql','utf8'))
  await apply("INSERT INTO iw_templates VALUES('template'); INSERT INTO iw_envelopes VALUES('envelope'); INSERT INTO iw_pdf_uploads VALUES('upload'); INSERT INTO iw_filing_rules VALUES('template','dropbox','/original',1,7,'owner','recorded-at','id:pinned'); INSERT INTO iw_filing_jobs(envelope_id,provider,folder,kind,sha256,state,folder_ref,resolved_folder,folder_repair_json) VALUES('envelope','dropbox','/original','signed','fingerprint','uncertain','id:pinned','/moved','{\"id\":\"id:pinned\"}');")
  const rule=await db.prepare('SELECT * FROM iw_filing_rules').first(),job=await db.prepare('SELECT * FROM iw_filing_jobs').first()
  await apply(await readFile('migrations/core/0081_microsoft.sql','utf8'))
  assert.deepEqual(await db.prepare('SELECT * FROM iw_filing_rules').first(),rule)
  assert.deepEqual(await db.prepare('SELECT * FROM iw_filing_jobs').first(),job)
  await db.prepare("INSERT INTO iw_filing_rules VALUES('template','sharepoint','drive:folder',1,1,'owner','recorded-at',NULL)").run()
  await db.prepare("INSERT INTO iw_microsoft_uploads VALUES('upload','{}')").run()
  assert.equal((await db.prepare('SELECT count(*) AS n FROM iw_filing_rules').first()).n,2)
 }finally{await mf.dispose()}
})
