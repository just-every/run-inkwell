// PREP-003 round A joins PREP-008 and SIGNX-003 at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { startInkwell, screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app=await startInkwell(),images=process.env.INKWELL_FIELD_PROOF_DIR??'/tmp/inkwell-field-types'
await mkdir(images,{recursive:true})
try {
 const pdf=await PDFDocument.create();pdf.addPage([612,792]);pdf.addPage([612,792])
 for(const width of [1440,390]) {
  const title=`PREP-003 round A ${width}`,make=(id,label,type,i,extra={})=>({id,label,type,signer:0,page:i<8?0:1,x:.1,y:.12+(i%8)*.09,width:.7,height:.04,...extra})
  const fields=[make('sig','Client signature','signature',0),make('ini','Client initials','initials',1),make('ini2','Second initials','initials',2),make('signed','Date signed','date_signed',3),...[
   ['name','Full name','full_name','Mara Quinn'],['email','Contact email','email','mara@clients.example'],['company','Company','company','Acme Workshop'],['title','Job title','title','Director'],
  ].map(([id,label,type,value],i)=>make(id,label,type,i+4,{prefill:{value,source:`Sender fixture / ${id}`},readOnly:id==='company'})),...[
   ['zip','ZIP code','zip'],['phone','Phone number','phone'],['ssn','Social security number','ssn'],['ein','Employer number','ein'],['date','Agreement date','date'],
  ].map(([id,label,pattern],i)=>make(id,label,'text',i+8,{pattern}))]
  const template=(await app.command('template.save',{title,filename:'round-a.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields})).id
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(20000)
  const capture=async(name,p=page)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`PREP-003 ${name} ${width}: no sideways scroll`);await p.screenshot({path:`${images}/${width}-${name}.png`})}
  const keyboardSet=async(p,locator,value)=>{await tabTo(p,locator);await p.keyboard.press('ControlOrMeta+A');await p.keyboard.type(value)}
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Templates',exact:true}).click();await page.getByRole('button',{name:`Edit ${title}`,exact:true}).click()
  // Every new type has an inspector and a native keyboard type picker; prefills and source labels survive authoring.
  for(const [index,f] of fields.entries()) {
   if(f.type==='signature'||f.type==='text'||f.id==='ini2')continue
   const selection=page.getByRole('checkbox',{name:new RegExp(`Select field ${index+1}: ${f.label}`)});await tabTo(page,selection);await page.keyboard.press('Space')
   const type=page.getByLabel('Type of the selected field',{exact:true});await tabTo(page,type);assert.equal(await type.inputValue(),f.type)
   if(f.prefill){assert.equal(await page.getByLabel('Prefill value',{exact:true}).inputValue(),f.prefill.value);assert.equal(await page.getByLabel('Source (reported by sender/API)',{exact:true}).inputValue(),f.prefill.source);assert.equal(await page.getByLabel('Read-only for signer',{exact:true}).isChecked(),Boolean(f.readOnly))}
   else assert.equal(await page.getByLabel('Prefill value',{exact:true}).count(),0,'initials and date signed cannot be supplied as sender prefill')
   for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-003 ${f.type} inspector ${width} ${theme}`)}
   if(f.type==='date_signed'||f.type==='company'){await type.scrollIntoViewIfNeeded();await capture(`inspector-${f.type}`)}
   await tabTo(page,page.getByRole('button',{name:'Clear selection',exact:true}));await page.keyboard.press('Enter')
  }
  // Configure a validation pattern by keyboard on the preparation surface.
  await page.getByRole('checkbox',{name:/Select field 9: ZIP code/}).check();const pattern=page.getByLabel('Validation pattern',{exact:true});await tabTo(page,pattern);await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await pattern.inputValue(),'zip')
  await axe(page,`PREP-003 pattern inspector ${width}`);await pattern.scrollIntoViewIfNeeded();await capture('inspector-pattern');await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('button',{name:`Use ${title}`,exact:true}).waitFor()
  const id=(await app.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:`mara-${width}@clients.example`}]})).id
  const invitation=(await app.command('envelope.approve',{id,eligible:true})).invitations[0]
  const signer=await context.newPage();signer.setDefaultTimeout(20000);await signer.goto(invitation.url)
  await keyboardSet(signer,signer.getByLabel('Verification code',{exact:true}),invitation.code);await tabTo(signer,signer.getByRole('button',{name:'Verify code',exact:true}));await signer.keyboard.press('Enter')
  await tabTo(signer,signer.getByRole('checkbox',{name:/I have read the electronic record/}));await signer.keyboard.press('Space');await tabTo(signer,signer.getByRole('button',{name:'Agree and continue',exact:true}));await signer.keyboard.press('Enter')
  const form=signer.locator('.iw-sign-fields');await form.getByRole('heading',{name:'Your fields'}).waitFor()
  const input=label=>form.getByLabel(new RegExp(`^${label}`))
  const snapshot=await form.ariaSnapshot();for(const f of fields)assert.ok(snapshot.includes(f.label),`accessibility tree names ${f.label}`)
  for(const [label,value] of [['Full name','Mara Quinn'],['Contact email','mara@clients.example'],['Company','Acme Workshop'],['Job title','Director']])assert.equal(await input(label).inputValue(),value)
  assert.ok(snapshot.includes('Supplied by the caller, not verified with the CRM.'))
  await tabTo(signer,input('Company'));await signer.keyboard.type('Changed');assert.equal(await input('Company').inputValue(),'Acme Workshop','keyboard cannot change a locked business field')
  const zone=form.getByLabel('Signing time zone');await tabTo(signer,zone);await signer.keyboard.press('End');await signer.keyboard.press('Enter');assert.equal(await zone.inputValue(),'Pacific/Honolulu')
  assert.ok(await input('Date signed').getAttribute('readonly')!==null);assert.match(await input('Date signed').inputValue(),/^\d{4}-\d{2}-\d{2}$/)
  for(const [label,bad,good] of [['ZIP code','bad','02110'],['Phone number','bad','212-555-0100'],['Social security number','bad','123-45-6789'],['Employer number','bad','12-3456789'],['Contact email','bad','updated@clients.example'],['Agreement date','2026-02-30','2026-10-21']]) {
   const control=input(label);await keyboardSet(signer,control,bad);assert.equal(await control.getAttribute('aria-invalid'),'true');assert.ok((await form.ariaSnapshot()).includes(`for ${label}.`),'field-level message appears in the accessibility tree');await keyboardSet(signer,control,good);assert.equal(await control.getAttribute('aria-invalid'),'false')
  }
  for(const label of ['Social security number','Employer number'])assert.equal(await input(label).getAttribute('type'),'password','masked entries use password display')
  await keyboardSet(signer,input('Full name'),'Mara Updated');await keyboardSet(signer,input('Job title'),'Principal')
  await keyboardSet(signer,input('Client signature'),'Mara Quinn');await keyboardSet(signer,input('Client initials'),'MQ');assert.equal(await input('Second initials').inputValue(),'MQ','one initials entry fills every initials field')
  const adopted=signer.getByRole('group',{name:'Adopt your initials applied to every initials field'})
  const style=adopted.getByRole('radio',{name:/Serif italic$/});await tabTo(signer,style);await signer.keyboard.press('Space')
  assert.ok((await adopted.ariaSnapshot()).includes('[checked]'),'initials style exposes checked state to a screen reader')
  if(width===390){await adopted.getByRole('radio',{name:'Draw',exact:true}).check();const pad=adopted.getByRole('img',{name:/Initials drawing area/});await pad.scrollIntoViewIfNeeded();const box=await pad.boundingBox(),cdp=await context.newCDPSession(signer),stroke=[{x:box.x+20,y:box.y+box.height*.6},{x:box.x+45,y:box.y+20},{x:box.x+70,y:box.y+box.height*.7},{x:box.x+100,y:box.y+25}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stroke[0]]});for(const point of stroke.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  for(const theme of ['light','dark']){await signer.emulateMedia({colorScheme:theme});await axe(signer,`PREP-003 all types signing ${width} ${theme}`)}
  await input('Social security number').scrollIntoViewIfNeeded();await capture('signing-fields',signer);await adopted.scrollIntoViewIfNeeded();await capture('initials',signer)
  await tabTo(signer,signer.getByRole('button',{name:'Start',exact:true}));await signer.keyboard.press('Enter');await signer.getByText(`All ${fields.length} required fields complete`,{exact:true}).waitFor()
  await tabTo(signer,signer.getByRole('checkbox',{name:/consent to electronic signatures/}));await signer.keyboard.press('Space');await tabTo(signer,signer.getByRole('button',{name:'Sign document',exact:true}));await signer.keyboard.press('Enter')
  await signer.getByRole('heading',{name:'All signatures are complete.'}).waitFor();await signer.locator('.iw-pdf-page[data-rendered]').first().waitFor();await capture('completed',signer)
  await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();const displayed=page.getByRole('region',{name:'Entered field values'});await displayed.waitFor();const content=await displayed.innerText();assert.ok(content.includes('••••••••'));assert.ok(!content.includes('123-45-6789')&&!content.includes('12-3456789'),'dashboard conceals masked values');assert.ok(content.includes('Mara Updated')&&content.includes('Principal'));await displayed.scrollIntoViewIfNeeded()
  for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-003 dashboard ${width} ${theme}`)}await capture('masked-dashboard')
  const e=(await (await context.request.get(app.origin+'/api/inkwell/envelopes/'+id)).json()).envelope;assert.equal(e.signers[0].initialsAdoption.method,width===390?'drawn':'typed');assert.equal(e.signers[0].values.ini,e.signers[0].values.ini2);assert.equal(e.signers[0].values.ssn,'123-45-6789');assert.equal(e.signers[0].signingTimeZone,'Pacific/Honolulu')
  await context.close()
 }
 console.log('PREP-003 round A PASS: template field controls, validation, prefills/sources/locks, all-type keyboard/accessibility-tree completion, typed and touch-drawn initials, automatic dates and masked dashboard; 1440/390 light/dark axe')
} catch(error){await screenshots(app.browser,'prep-003');throw error}finally{await app.close()}
