import { appendEvent, canonical, insist, secret, sha256, type Env } from './model'
import { commitEnvelope, type Guard } from './storage'
import { accessGate, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import { checkPaymentCheckout, startPaymentCheckout, paymentsReady } from './payment-provider'
import type { PaymentReceipt } from './payment-requirement'
import { seal, unseal } from './seal'

type PaymentRow={id:string;envelope_id:string;signer:number;token_hash:string;requirement_hash:string;checkout_reference:string|null;sealed_url:string|null;receipt:string|null;consumed_at:string|null}
function paymentContext(env:Env,context:SigningContext){
 insist(context.verified,'Verify your identity before continuing to payment.',401);turn(context);accessGate(context)
 const signer=recipientOf(context);disclosureGate(signer,'authorizing payment',context.envelope.consumerDisclosure)
 insist(signer.payment,'This recipient has no payment requirement.',409)
 insist(paymentsReady(env),'Stripe is not configured. Contact the sender.',503)
 return signer.payment
}
async function paymentRow(env:Env,context:SigningContext){
 const requirement=paymentContext(env,context),hash=await sha256(canonical(requirement))
 const row=await env.DB.prepare('SELECT * FROM iw_payments WHERE envelope_id=? AND signer=? AND token_hash=? AND requirement_hash=?').bind(context.envelope.id,context.recipient.row,context.recipient.token_hash,hash).first<PaymentRow>()
 return{requirement,hash,row}
}
const rowGuard=(row:PaymentRow):Guard=>({sql:'EXISTS(SELECT 1 FROM iw_payments WHERE id=? AND token_hash=? AND requirement_hash=? AND checkout_reference IS ? AND consumed_at IS NULL)',values:[row.id,row.token_hash,row.requirement_hash,row.checkout_reference]})
export async function startSigningPayment(env:Env,context:SigningContext,input:Record<string,unknown>){
 insist(Object.keys(input).every(key=>key==='consent'),'Send only payment authorization to Inkwell. Card and bank details belong on Stripe.')
 insist(input.consent===true,'Explicitly authorize continuing to Stripe.')
 let {requirement,hash,row}=await paymentRow(env,context)
 insist(!recipientOf(context).paymentReceipt||recipientOf(context).paymentReceipt?.outcome!=='succeeded','Stripe already confirmed this requirement. Finish signing without starting another payment.',409)
 if(!row){
  const id=secret(),after=structuredClone(context.envelope)
  await appendEvent(after,'signer.payment_authorized',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,requirement,obligation:id,consent:true,consentVersion:'stripe-hosted-2026-10-26',...context.client})
  await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('INSERT INTO iw_payments(id,envelope_id,signer,token_hash,requirement_hash) VALUES(?,?,?,?,?)').bind(id,after.id,context.recipient.row,context.recipient.token_hash,hash)],[liveGuard(context),sessionGuard(context)])
  row={id,envelope_id:after.id,signer:context.recipient.row,token_hash:context.recipient.token_hash,requirement_hash:hash,checkout_reference:null,sealed_url:null,receipt:null,consumed_at:null}
  context={...context,envelope:after}
 }
 insist(!row.consumed_at,'This payment was already used for signing.',409)
 if(row.sealed_url){const url=await unseal(env,'payment-checkout',row.id,row.sealed_url);insist(url,'This checkout belongs to an earlier installation. Contact the sender.',409);return{url,reference:row.checkout_reference}}
 const checkout=await startPaymentCheckout(env,{requirement,idempotencyKey:'inkwell:'+row.id,reference:row.id,returnUrl:new URL('/payment-return',env.AUTH_ORIGIN).href})
 const after=structuredClone(context.envelope)
 await appendEvent(after,'signer.payment_started',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,obligation:row.id,reference:checkout.reference})
 await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('UPDATE iw_payments SET checkout_reference=?,sealed_url=? WHERE id=?').bind(checkout.reference,await seal(env,'payment-checkout',row.id,checkout.url),row.id)],[liveGuard(context),sessionGuard(context),rowGuard(row)])
 return checkout
}
export async function checkSigningPayment(env:Env,context:SigningContext){
 const {requirement,row}=await paymentRow(env,context);insist(row?.checkout_reference,'Open the Stripe checkout first.',409)
 const receipt=await checkPaymentCheckout(env,{requirement,reference:row.checkout_reference,clientReference:row.id})
 const after=structuredClone(context.envelope);after.signers[context.recipient.signer].paymentReceipt=receipt
 await appendEvent(after,'signer.payment_checked',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,obligation:row.id,requirement,receipt})
 await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('UPDATE iw_payments SET receipt=? WHERE id=?').bind(JSON.stringify(receipt),row.id)],[liveGuard(context),sessionGuard(context),rowGuard(row)])
 return receipt
}
/** A failed or pending provider read happens before any executed signature or mark is stored. */
export async function signingPaymentProof(env:Env,context:SigningContext){
 if(!context.envelope.signers[context.recipient.signer].payment)return undefined
 const {requirement,row}=await paymentRow(env,context);insist(row?.checkout_reference,'Complete the required Stripe checkout before signing.',409)
 const receipt=await checkPaymentCheckout(env,{requirement,reference:row.checkout_reference,clientReference:row.id})
 insist(receipt.outcome==='succeeded','Stripe has not confirmed this requirement. Your signature has not been saved.',409)
 return{receipt,guard:rowGuard(row),write:env.DB.prepare('UPDATE iw_payments SET receipt=?,consumed_at=?,sealed_url=NULL WHERE id=?').bind(JSON.stringify(receipt),new Date().toISOString(),row.id)}
}
export function requirePaidSignature(signer:{payment?:unknown;paymentReceipt?:PaymentReceipt;signedAt?:string;paper?:{status:string}}){
 if(signer.payment&&(signer.signedAt||signer.paper?.status==='accepted'))insist(signer.paymentReceipt?.outcome==='succeeded','Stripe must confirm the required payment before this signature can be saved.',409)
}
