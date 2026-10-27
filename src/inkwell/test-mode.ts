import {PDFDocument,StandardFonts,rgb} from 'pdf-lib'
import {insist,type Actor,type Envelope} from './model'
export const testLabel='TEST MODE - NON-BINDING'
export async function watermark(bytes:Uint8Array){const pdf=await PDFDocument.load(bytes),font=await pdf.embedFont(StandardFonts.HelveticaBold);for(const page of pdf.getPages()){const {width,height}=page.getSize(),size=Math.min(22,width/22);for(const y of [20,height/2,height-40])page.drawText(testLabel,{x:10,y:Math.max(0,y),size,font,color:rgb(.65,.08,.08),opacity:.65})}return new Uint8Array(await pdf.save())}
export function apiMode(actor:Actor,envelope:Envelope){insist(Boolean(actor.testMode)===Boolean(envelope.testMode),'Envelope not found in this API key mode.',404)}
