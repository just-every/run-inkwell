import { currentPayment, type PaymentRow } from './payment-state'
import { appendEvent, canonical, insist, secret, sha256, type Env } from './model'
import { commitEnvelope, type Guard } from './storage'
import { accessGate, disclosureGate, liveGuard, recipientOf, sessionGuard, turn, type SigningContext } from './signing'
import { checkPaymentCheckout, startPaymentCheckout, paymentsReady } from './payment-provider'
import { paymentConsentText, type PaymentReceipt } from './payment-requirement'
import { seal, unseal } from './seal'

function paymentContext(env:Env,context:SigningContext){
 insist(context.verified,'Verify your identity before continuing to payment.',401);turn(context);accessGate(context)
 const signer=recipientOf(context);disclosureGate(signer,'authorizing payment',context.envelope.consumerDisclosure)
 insist(signer.payment&&signer.paymentAuthority,'This recipient has no authorized payment requirement.',409)
 insist(paymentsReady(env),'Stripe is not configured. Contact the sender.',503)
 return signer.payment
}
async function paymentRow(env:Env,context:SigningContext){
 paymentContext(env,context)
 const state=await currentPayment(env,context);insist(state,'This payment requirement has no configuration authority.',409);return state
}
const rowGuard=(row:PaymentRow):Guard=>({sql:'EXISTS(SELECT 1 FROM iw_payments WHERE id=? AND token_hash=? AND requirement_hash=? AND checkout_reference IS ? AND consumed_at IS NULL)',values:[row.id,row.token_hash,row.requirement_hash,row.checkout_reference]})
export async function startSigningPayment(env:Env,context:SigningContext,input:Record<string,unknown>){
 insist(Object.keys(input).every(key=>key==='consent'||key==='requirementVersion'),'Send only payment authorization to Inkwell. Card and bank details belong on Stripe.')
 insist(input.consent===true,'Explicitly authorize continuing to Stripe.')
 let {requirement,authority,hash,row}=await paymentRow(env,context)
 insist(input.requirementVersion===authority.version,'The payment requirement changed. Review it and consent again.',409)
 if(!row){
  const id=secret(),after=structuredClone(context.envelope),historical=recipientOf(context).paymentReceipt
  let binding=id,recovered:PaymentReceipt|undefined
  if(historical){
   const consent=context.envelope.events.findLast(event=>event.action==='signer.payment_authorized'&&event.detail.signer===context.recipient.signer&&event.detail.requirementVersion===authority.version)
   insist(consent&&typeof consent.detail.providerBinding==='string','The historical payment needs sender reconciliation before signing.',409)
   binding=consent.detail.providerBinding
   recovered=await checkPaymentCheckout(env,{requirement,buyerReference:authority.buyer.reference,reference:historical.reference,clientReference:binding})
   insist(recovered.outcome==='succeeded','Stripe has not confirmed the historical payment. Contact the sender to reconcile it; no new charge was started.',409)
  }
  await appendEvent(after,'signer.payment_authorized',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,requirement,requirementVersion:authority.version,buyer:authority.buyer.reference,invitation:context.recipient.token_hash,obligation:id,providerBinding:binding,consentText:paymentConsentText(requirement,authority.buyer.name),consent:true,consentVersion:'stripe-hosted-2026-10-26',...context.client})
  await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('INSERT INTO iw_payments(id,envelope_id,signer,token_hash,requirement_hash,provider_binding,checkout_reference,receipt) VALUES(?,?,?,?,?,?,?,?)').bind(id,after.id,context.recipient.row,context.recipient.token_hash,hash,binding,recovered?.reference??null,recovered?JSON.stringify(recovered):null)],[liveGuard(context),sessionGuard(context)])
  row={id,envelope_id:after.id,signer:context.recipient.row,token_hash:context.recipient.token_hash,requirement_hash:hash,provider_binding:binding,checkout_reference:recovered?.reference??null,sealed_url:null,receipt:recovered?JSON.stringify(recovered):null,consumed_at:null}
  context={...context,envelope:after}
  if(recovered)return{reference:recovered.reference,confirmed:true}
 }
 insist(!row.consumed_at,'This payment was already used for signing.',409)
 if(row.receipt&&JSON.parse(row.receipt).outcome==='succeeded')return{reference:row.checkout_reference,confirmed:true}
 if(row.sealed_url){const url=await unseal(env,'payment-checkout',row.id,row.sealed_url);insist(url,'This checkout belongs to an earlier installation. Contact the sender.',409);return{url,reference:row.checkout_reference}}
 const checkout=await startPaymentCheckout(env,{requirement,buyerReference:authority.buyer.reference,idempotencyKey:'inkwell:'+row.id,reference:row.id,returnUrl:new URL('/payment-return',env.AUTH_ORIGIN).href})
 const after=structuredClone(context.envelope)
 await appendEvent(after,'signer.payment_started',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,obligation:row.id,reference:checkout.reference})
 await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('UPDATE iw_payments SET checkout_reference=?,sealed_url=? WHERE id=?').bind(checkout.reference,await seal(env,'payment-checkout',row.id,checkout.url),row.id)],[liveGuard(context),sessionGuard(context),rowGuard(row)])
 return checkout
}
export async function checkSigningPayment(env:Env,context:SigningContext){
 const {requirement,authority,row}=await paymentRow(env,context);insist(row?.checkout_reference,'Open the Stripe checkout first.',409)
 const receipt=await checkPaymentCheckout(env,{requirement,buyerReference:authority.buyer.reference,reference:row.checkout_reference,clientReference:row.provider_binding})
 const after=structuredClone(context.envelope);after.signers[context.recipient.signer].paymentReceipt=receipt
 await appendEvent(after,'signer.payment_checked',`signer:${context.recipient.signer+1}`,{signer:context.recipient.signer,obligation:row.id,requirement,receipt})
 await commitEnvelope(env,context.envelope,after,null,[env.DB.prepare('UPDATE iw_payments SET receipt=? WHERE id=?').bind(JSON.stringify(receipt),row.id)],[liveGuard(context),sessionGuard(context),rowGuard(row)])
 return receipt
}
/** A failed or pending provider read happens before any executed signature or mark is stored. */
export async function signingPaymentProof(env:Env,context:SigningContext){
 if(!context.envelope.signers[context.recipient.signer].payment)return undefined
 const {requirement,authority,row}=await paymentRow(env,context);insist(row?.checkout_reference,'Complete the required Stripe checkout before signing.',409)
 const receipt=await checkPaymentCheckout(env,{requirement,buyerReference:authority.buyer.reference,reference:row.checkout_reference,clientReference:row.provider_binding})
 insist(receipt.outcome==='succeeded','Stripe has not confirmed this requirement. Your signature has not been saved.',409)
 return{receipt,guard:rowGuard(row),write:env.DB.prepare('UPDATE iw_payments SET receipt=?,consumed_at=?,sealed_url=NULL WHERE id=?').bind(JSON.stringify(receipt),new Date().toISOString(),row.id)}
}
export function requirePaidSignature(signer:{payment?:unknown;paymentReceipt?:PaymentReceipt;signedAt?:string;paper?:{status:string}}){
 if(signer.payment&&(signer.signedAt||signer.paper?.status==='accepted'))insist(signer.paymentReceipt?.outcome==='succeeded','Stripe must confirm the required payment before this signature can be saved.',409)
}
