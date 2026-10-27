import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
/** Google Apps Script services are the provider boundary of the actual contextual entry point. */
export async function gmailCard(origin,messageId='gmail-message') {
 const widgets=[],headers=[],section={addWidget(widget){widgets.push(widget);return this}},card={setHeader(header){headers.push(header);return this},addSection(){return this},build(){return{widgets,headers}}}
 const control=()=>({setText(text){this.text=text;return this},setOpenLink(link){this.url=link.url;return this},setUrl(url){this.url=url;return this},setTitle(title){this.title=title;return this}})
 let capability=false
 const context={CardService:{newCardSection:()=>section,newCardBuilder:()=>card,newCardHeader:control,newTextParagraph:control,newTextButton:control,newOpenLink:control},GmailApp:{setCurrentMessageAccessToken(token){assert.equal(token,'synthetic-inkwell-1');capability=true},getMessageById(id){assert.equal(id,messageId);assert.equal(capability,true);return{getFrom:()=> 'Mara Quinn <mara@client.example>',getTo:()=> 'Harbour Owner <owner@harbour.example>',getCc:()=> 'Lee Chen <lee@client.example>',getAttachments:()=>[{getContentType:()=> 'application/pdf',getName:()=> 'client-agreement.pdf'}]}}},PropertiesService:{getScriptProperties:()=>({getProperty:key=>{assert.equal(key,'INKWELL_ORIGIN');return origin}})}}
 runInNewContext(await readFile('integrations/google/Code.gs','utf8'),context)
 return context.onGmailMessage({gmail:{messageId,accessToken:'synthetic-inkwell-1'}})
}
