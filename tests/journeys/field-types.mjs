// PREP-003 rounds A and B choice/note fields join PREP-008 and SIGNX-003 at desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'
import { expect } from '@playwright/test'
import { startInkwell, screenshots } from './worker.mjs'
import { axe, tabTo } from './a11y.mjs'

const app=await startInkwell(),images=process.env.INKWELL_FIELD_PROOF_DIR??'/tmp/inkwell-field-types'
await mkdir(images,{recursive:true})
const stampBase64=(await readFile('public/brand/icon-192.png')).toString('base64'),stampValue='data:image/png;base64,'+stampBase64,stampFile=images+'/fixture-stamp.png'
await writeFile(stampFile,Buffer.from(stampBase64,'base64'))
try {
 const pdf=await PDFDocument.create();pdf.addPage([612,792]);pdf.addPage([612,792]);pdf.addPage([612,792])
 for(const width of [1440,390]) {
  const title=`PREP-003 fields ${width}`,make=(id,label,type,i,extra={})=>({id,label,type,signer:0,page:Math.floor(i/8),x:.1,y:.12+(i%8)*.09,width:.7,height:.04,...extra})
  const fields=[make('sig','Client signature','signature',0),make('ini','Client initials','initials',1),make('ini2','Second initials','initials',2),make('signed','Date signed','date_signed',3),...[
   ['name','Full name','full_name','Mara Quinn'],['email','Contact email','email','mara@clients.example'],['company','Company','company','Acme Workshop'],['title','Job title','title','Director'],
  ].map(([id,label,type,value],i)=>make(id,label,type,i+4,{prefill:{value,source:`Sender fixture / ${id}`},readOnly:id==='company'})),...[
   ['zip','ZIP code','zip'],['phone','Phone number','phone'],['ssn','Social security number','ssn'],['ein','Employer number','ein'],['date','Agreement date','date'],
  ].map(([id,label,pattern],i)=>make(id,label,'text',i+8,{pattern})),...[
   ['radio','Delivery method','Courier',['Courier','Pickup','Mail']],['dropdown','Service level','Standard',['Standard','Priority','Economy']],
   ['checkbox_group','Contact methods','["Email","Phone"]',['Email','Phone','Post']],['note','Service note','Please deliver to reception'],['stamp','Approval stamp',stampValue],
  ].flatMap(([type,label,value,options],i)=>[make(type,label,type,13+i*2,{...(options?{options}:{}),...(type==='checkbox_group'?{minimum:2,maximum:2}:{}),prefill:{value,source:`Sender fixture / ${type}`}}),make(`${type}_locked`,`Locked ${label}`,type,14+i*2,{...(options?{options}:{}),...(type==='checkbox_group'?{minimum:2,maximum:2}:{}),prefill:{value,source:`API fixture / ${type}`},readOnly:true})])]
  const template=(await app.command('template.save',{title,filename:'round-a.pdf',pdfBase64:Buffer.from(await pdf.save()).toString('base64'),roles:[{role:'Client'}],fields})).id
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390});await context.addCookies([app.ownerCookie()]);const page=await context.newPage();page.setDefaultTimeout(20000)
  const capture=async(name,p=page)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`PREP-003 ${name} ${width}: no sideways scroll`);await p.screenshot({path:`${images}/${width}-${name}.png`})}
  const tab=async(p,target)=>{await target.waitFor({state:'visible',timeout:5000});if(await target.evaluate(el=>el===document.activeElement))return;const backwards=await target.evaluate(el=>Boolean(document.activeElement?.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_PRECEDING));await tabTo(p,target,{backwards})}
  const keyboardSet=async(p,locator,value)=>{await tab(p,locator);await p.keyboard.press('ControlOrMeta+A');await p.keyboard.type(value)}
  const keyboardChoose=async(p,control,file)=>{
   // Listen before keyboard navigation, then verify input focus before opening the picker.
   const [chooser]=await Promise.all([p.waitForEvent('filechooser'),(async()=>{
    await tab(p,control);await expect(control).toBeEnabled();await expect(control).toBeFocused()
    await p.keyboard.press('Space')
   })()])
   await chooser.setFiles(file)
  }
  await page.goto(app.origin+'/app');await page.getByRole('button',{name:'Templates',exact:true}).click();await page.getByRole('button',{name:`Edit ${title}`,exact:true}).click()
  // Leave native selects with Tab after choosing a value. Enter can submit the
  // enclosing form on some platforms; Save and Finish remain explicit below.
  // Every new type has an inspector and a native keyboard type picker; prefills and source labels survive authoring.
  for(const [index,f] of fields.entries()) {
   if(f.type==='signature'||f.type==='text'||f.id==='ini2')continue
   console.log(`PREP-003 inspector ${width}: ${f.type}`)
   const selection=page.getByRole('checkbox',{name:new RegExp(`Select field ${index+1}: ${f.label}`)});await tab(page,selection);await page.keyboard.press('Space')
   const type=page.getByLabel('Type of the selected field',{exact:true});await tabTo(page,type,{backwards:true});await page.keyboard.press('Home');for(let step=0;step<['signature','text','date','checkbox','number','initials','date_signed','full_name','email','company','title','radio','dropdown','checkbox_group','note','stamp'].indexOf(f.type);step++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await type.inputValue(),f.type)
   if(f.options){const options=page.getByLabel('Options (one per line)',{exact:true});await keyboardSet(page,options,f.options.join('\n'));assert.equal(await options.inputValue(),f.options.join('\n'));if(f.type==='checkbox_group'){for(const [label,value] of [['Minimum selections','2'],['Maximum selections','2']]){await keyboardSet(page,page.getByLabel(label,{exact:true}),value);assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),value)}}}
   if(f.prefill){if(f.type==='stamp'){await keyboardChoose(page,page.getByLabel(/^Prefill value/),stampFile);await page.getByRole('img',{name:'Preview of Prefill value',exact:true}).waitFor()}else if(f.type==='checkbox_group'){const prefill=page.getByRole('group',{name:'Prefill value',exact:true});for(const option of f.options){const control=prefill.getByRole('checkbox',{name:option,exact:true});const expected=JSON.parse(f.prefill.value).includes(option);if(await control.isChecked()!==expected){await tab(page,control);await page.keyboard.press('Space')}assert.equal(await control.isChecked(),expected)}}else if(f.options){const select=page.getByLabel('Prefill value',{exact:true});await tab(page,select);await page.keyboard.press('Home');for(let i=0;i<=f.options.indexOf(f.prefill.value);i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await select.inputValue(),f.prefill.value)}else await keyboardSet(page,page.getByLabel('Prefill value',{exact:true}),f.prefill.value);await keyboardSet(page,page.getByLabel('Source (reported by sender or API)',{exact:true}),f.prefill.source);const locked=page.getByLabel('Read-only for signer',{exact:true});if(await locked.isChecked()!==Boolean(f.readOnly)){await tab(page,locked);await page.keyboard.press('Space')}if(!['checkbox_group','stamp'].includes(f.type))assert.equal(await page.getByLabel('Prefill value',{exact:true}).inputValue(),f.prefill.value);assert.equal(await page.getByLabel('Source (reported by sender or API)',{exact:true}).inputValue(),f.prefill.source);assert.equal(await page.getByLabel('Read-only for signer',{exact:true}).isChecked(),Boolean(f.readOnly))}
   else assert.equal(await page.getByLabel('Prefill value',{exact:true}).count(),0,'initials and date signed cannot be supplied as sender prefill')
   for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-003 ${f.type} inspector ${width} ${theme}`)}
   await type.scrollIntoViewIfNeeded();await capture(`inspector-${f.type}`)
   await tab(page,page.getByRole('button',{name:'Clear selection',exact:true}));await page.keyboard.press('Enter')
  }
  // Configure a validation pattern by keyboard on the preparation surface.
  await page.getByRole('checkbox',{name:/Select field 9: ZIP code/}).check();const pattern=page.getByLabel('Validation pattern',{exact:true});await tab(page,pattern);await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await pattern.inputValue(),'zip')
  await page.getByLabel('Required condition field',{exact:true}).selectOption('ssn');const comparison=page.getByLabel('Required condition value',{exact:true});assert.equal(await comparison.getAttribute('type'),'password');await keyboardSet(page,comparison,'123-45-6789')
  await axe(page,`PREP-003 pattern inspector ${width}`);await pattern.scrollIntoViewIfNeeded();await capture('inspector-pattern');await page.getByRole('button',{name:'Clear selection',exact:true}).click()
  await page.getByRole('button',{name:'Save new version',exact:true}).click();await page.getByRole('button',{name:`Use ${title}`,exact:true}).waitFor()
  const id=(await app.command('template.use',{id:template,recipients:[{name:'Mara Quinn',email:`mara-${width}@clients.example`}]})).id
  console.log(`PREP-003 signing ${width}`)
  const draft=(await (await context.request.get(app.origin+'/api/inkwell/envelopes/'+id)).json()).envelope
  await app.command('envelope.update',{...draft,pdfBase64:Buffer.from(await pdf.save()).toString('base64'),copies:[{name:'Record keeper',email:`records-${width}@clients.example`,includeWhen:{field:'ssn',operator:'equals',value:'123-45-6789'}}]})
  await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();const preview=page.getByRole('region',{name:'Routing preview'});await preview.waitFor();assert.ok(!(await preview.innerText()).includes('123-45-6789'),'PREP-003 routing preview masks comparison values');await preview.scrollIntoViewIfNeeded();await capture('masked-routing-preview');await axe(page,`PREP-003 masked routing ${width}`)
  const invitation=(await app.command('envelope.approve',{id,eligible:true})).invitations[0]
  const signer=await context.newPage();signer.setDefaultTimeout(20000);await signer.goto(invitation.url)
  await keyboardSet(signer,signer.getByLabel('Verification code',{exact:true}),invitation.code);await tab(signer,signer.getByRole('button',{name:'Verify code',exact:true}));await signer.keyboard.press('Enter')
  await tab(signer,signer.getByRole('checkbox',{name:/I have read the electronic record/}));await signer.keyboard.press('Space');await tab(signer,signer.getByRole('button',{name:'Agree and continue',exact:true}));await signer.keyboard.press('Enter')
  const form=signer.locator('.iw-sign-fields');await form.getByRole('heading',{name:'Your fields'}).waitFor()
  const input=label=>form.getByLabel(new RegExp(`^${label}`))
  const snapshot=await form.ariaSnapshot();for(const f of fields)assert.ok(snapshot.includes(f.label),`accessibility tree names ${f.label}`)
  for(const [label,value] of [['Full name','Mara Quinn'],['Contact email','mara@clients.example'],['Company','Acme Workshop'],['Job title','Director']])assert.equal(await input(label).inputValue(),value)
  assert.ok(snapshot.includes('Supplied by the caller, not verified with the CRM.'))
  await tab(signer,input('Company'));await signer.keyboard.type('Changed');assert.equal(await input('Company').inputValue(),'Acme Workshop','keyboard cannot change a locked business field')
  const zone=form.getByLabel('Signing time zone');await tab(signer,zone);await signer.keyboard.press('End');await signer.keyboard.press('Tab');assert.equal(await zone.inputValue(),'Pacific/Honolulu')
  assert.ok(await input('Date signed').getAttribute('readonly')!==null);assert.match(await input('Date signed').inputValue(),/^\d{4}-\d{2}-\d{2}$/)
  for(const [label,bad,good] of [['ZIP code','bad','02110'],['Phone number','bad','212-555-0100'],['Social security number','bad','123-45-6789'],['Employer number','bad','12-3456789'],['Contact email','bad','updated@clients.example'],['Agreement date','2026-02-30','2026-10-21']]) {
   const control=input(label);await keyboardSet(signer,control,bad);assert.equal(await control.getAttribute('aria-invalid'),'true');assert.ok((await form.ariaSnapshot()).includes(`for ${label}.`),'field-level message appears in the accessibility tree');await keyboardSet(signer,control,good);assert.equal(await control.getAttribute('aria-invalid'),'false')
  }
  for(const label of ['Social security number','Employer number'])assert.equal(await input(label).getAttribute('type'),'password','masked entries use password display')
  // PREP-003 round B: native radio/select/group controls expose checked/selected state and complete by keyboard.
  const radio=form.getByRole('group',{name:'Delivery method (required)',exact:true});await tab(signer,radio.getByRole('radio',{name:'Courier',exact:true}));await signer.keyboard.press('ArrowDown');assert.ok(await radio.getByRole('radio',{name:'Pickup',exact:true}).isChecked());assert.ok((await radio.ariaSnapshot()).includes('Pickup" [checked]'))
  const dropdown=input('Service level');assert.equal(await dropdown.inputValue(),'Standard');await tab(signer,dropdown);await signer.keyboard.press('End');await signer.keyboard.press('Tab');assert.equal(await dropdown.inputValue(),'Economy');assert.ok((await dropdown.ariaSnapshot()).includes('Economy" [selected]'))
  const contacts=form.getByRole('group',{name:'Contact methods (required)',exact:true});await tab(signer,contacts.getByRole('checkbox',{name:'Email',exact:true}));await signer.keyboard.press('Space');assert.equal(await contacts.getAttribute('aria-invalid'),'true');assert.ok((await contacts.ariaSnapshot()).includes('Choose at least 2 options'));await tab(signer,contacts.getByRole('checkbox',{name:'Post',exact:true}));await signer.keyboard.press('Space');assert.equal(await contacts.getAttribute('aria-invalid'),'false');assert.ok((await contacts.ariaSnapshot()).includes('Post" [checked]'))
  const lockedRadio=form.getByRole('group',{name:'Locked Delivery method (required)',exact:true});assert.ok(await lockedRadio.getByRole('radio',{name:'Courier',exact:true}).isChecked());assert.ok(await lockedRadio.getByRole('radio',{name:'Pickup',exact:true}).isDisabled())
  assert.ok(await input('Locked Service level').isDisabled());assert.equal(await input('Locked Service level').inputValue(),'Standard')
  const lockedContacts=form.getByRole('group',{name:'Locked Contact methods (required)',exact:true});assert.equal(await lockedContacts.getByRole('checkbox').count(),3);for(const control of await lockedContacts.getByRole('checkbox').all())assert.ok(await control.isDisabled());assert.ok(await lockedContacts.getByRole('checkbox',{name:'Email',exact:true}).isChecked())
  await keyboardSet(signer,input('Service note'),'Leave with the concierge');await tab(signer,input('Locked Service note'));await signer.keyboard.type('Changed');assert.equal(await input('Locked Service note').inputValue(),'Please deliver to reception')
  const stampControl=input('Approval stamp');await keyboardChoose(signer,stampControl,stampFile);await form.getByRole('img',{name:'Preview of Approval stamp',exact:true}).waitFor();assert.ok(await input('Locked Approval stamp').isDisabled());assert.ok((await form.ariaSnapshot()).includes('Preview of Locked Approval stamp'));await stampControl.scrollIntoViewIfNeeded();await capture('stamp-controls',signer)
  await contacts.scrollIntoViewIfNeeded();await capture('choice-controls',signer);await lockedContacts.scrollIntoViewIfNeeded();await capture('locked-choice-controls',signer)
  await keyboardSet(signer,input('Full name'),'Mara Updated');await keyboardSet(signer,input('Job title'),'Principal')
  await keyboardSet(signer,input('Client signature'),'Mara Quinn');await keyboardSet(signer,input('Client initials'),'MQ');assert.equal(await input('Second initials').inputValue(),'MQ','one initials entry fills every initials field')
  const adopted=signer.getByRole('group',{name:'Adopt your initials applied to every initials field'})
  const style=adopted.getByRole('radio',{name:/Sans italic$/});await tab(signer,style);await signer.keyboard.press('ArrowDown');assert.ok(await adopted.getByRole('radio',{name:/Serif italic$/}).isChecked())
  assert.ok((await adopted.ariaSnapshot()).includes('[checked]'),'initials style exposes checked state to a screen reader')
  if(width===390){await adopted.getByRole('radio',{name:'Draw',exact:true}).check();const pad=adopted.getByRole('img',{name:/Initials drawing area/});await pad.scrollIntoViewIfNeeded();await pad.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));const box=await pad.boundingBox(),cdp=await context.newCDPSession(signer),stroke=Array.from({length:24},(_,i)=>({x:box.x+20+i*(box.width-40)/23,y:box.y+box.height/2+Math.sin(i/3)*box.height/4}));assert.ok(await pad.evaluate((el,point)=>document.elementFromPoint(point.x,point.y)===el,stroke[0]),'touch starts on the visible initials canvas above the guide');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stroke[0]]});for(const point of stroke.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await adopted.getByRole('status').filter({hasText:'Draw your initials in the box.'}).waitFor({state:'detached'})}
  for(const theme of ['light','dark']){await signer.emulateMedia({colorScheme:theme});await axe(signer,`PREP-003 all types signing ${width} ${theme}`)}
  await input('Social security number').scrollIntoViewIfNeeded();await capture('signing-fields',signer);await adopted.scrollIntoViewIfNeeded();await capture('initials',signer)
  await tab(signer,signer.getByRole('button',{name:'Start',exact:true}));await signer.keyboard.press('Enter');await signer.getByText(`All ${fields.length} required fields complete`,{exact:true}).waitFor()
  await tab(signer,signer.getByRole('checkbox',{name:/consent to electronic signatures/}));await signer.keyboard.press('Space');await tab(signer,signer.getByRole('button',{name:'Sign document',exact:true}));await signer.keyboard.press('Enter')
  await signer.getByRole('heading',{name:'All signatures are complete.'}).waitFor();await signer.locator('.iw-pdf-page[data-rendered]').first().waitFor();await capture('completed',signer)
  await page.goto(app.origin+'/app');await page.getByRole('row',{name:new RegExp(title)}).click();const displayed=page.getByRole('region',{name:'Entered field values'});await displayed.waitFor();const content=await displayed.innerText();assert.ok(content.includes('••••••••'));assert.ok(!content.includes('123-45-6789')&&!content.includes('12-3456789'),'dashboard conceals masked values');assert.ok(content.includes('Mara Updated')&&content.includes('Principal'));for(const value of ['Pickup','Economy','Phone, Post','Leave with the concierge','Uploaded stamp image'])assert.ok(content.includes(value),`PREP-003 dashboard retains ${value}`);assert.ok(!(await page.locator('body').innerText()).includes('123-45-6789'),'PREP-003 dashboard routing outcomes also mask source answers');await displayed.scrollIntoViewIfNeeded()
  for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await axe(page,`PREP-003 dashboard ${width} ${theme}`)}await capture('masked-dashboard')
  const e=(await (await context.request.get(app.origin+'/api/inkwell/envelopes/'+id)).json()).envelope;assert.equal(e.signers[0].initialsAdoption.method,width===390?'drawn':'typed');assert.equal(e.signers[0].values.ini,e.signers[0].values.ini2);assert.equal(e.signers[0].values.ssn,'123-45-6789');assert.equal(e.signers[0].signingTimeZone,'Pacific/Honolulu')
  const stampEvidence=e.events.findLast(event=>event.action==='signer.signed').detail.stamps
  assert.equal(stampEvidence.length,2,'PREP-003 browser-signed stamps carry audit evidence')
  for(const evidence of stampEvidence){assert.equal(evidence.mediaType,'image/png');assert.equal(evidence.bytes,Buffer.from(stampBase64,'base64').length);assert.match(evidence.sha256,/^[a-f0-9]{64}$/);assert.equal(evidence.supplier.kind,'sender/API prefill')}
  assert.deepEqual(stampEvidence.map(e=>e.supplier),[{kind:'sender/API prefill',source:'Sender fixture / stamp',readOnly:false},{kind:'sender/API prefill',source:'API fixture / stamp',readOnly:true}])
  const downloaded=page.waitForEvent('download');await tab(page,page.getByRole('link',{name:'Certificate',exact:true}));await page.keyboard.press('Enter');const certificateDownload=await downloaded,certificateBytes=await readFile(await certificateDownload.path())
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),certificate=await getDocument({data:new Uint8Array(certificateBytes),standardFontDataUrl:new URL('../../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise
  let certificateText='';for(let i=1;i<=certificate.numPages;i++)certificateText+=(await(await certificate.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+' '
  for(const evidence of stampEvidence)assert.ok(certificateText.replace(/\s/g,'').includes(`Stamp (${evidence.label}): PNG SHA-256 ${evidence.sha256}, sender/API prefill`.replace(/\s/g,'')),'PREP-003 downloaded certificate names the stamp and fingerprint')
  assert.ok(certificateText.includes('not a verified seal'),'PREP-003 downloaded certificate keeps the honest stamp label')
  await context.close()
 }
 console.log('PREP-003 rounds A and B choice/note/stamp PASS: template field controls, validation, prefills/sources/locks, all-type keyboard/accessibility-tree completion, typed and touch-drawn initials, automatic dates and masked dashboard; 1440/390 light/dark axe')
} catch(error){await screenshots(app.browser,'prep-003');console.error(`Field-types failure screenshots: ${tmpdir()}/prep-003-0.png (operator), ${tmpdir()}/prep-003-1.png (signer, when open)`);throw error}finally{await app.close()}
