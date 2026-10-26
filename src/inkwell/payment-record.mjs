/** Business custody binds requirements and normalized provider outcomes to their audited public-door actions. */
const only=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
function validRequirement(value){
 if(!only(value,['kind','currency','amount','method'])||typeof value.currency!=='string'||!(/^[a-z]{3}$/).test(value.currency))return false;
 if(['saved_card','ach_mandate'].includes(value.kind))return value.amount===undefined&&value.method===undefined&&(value.kind!=='ach_mandate'||value.currency==='usd');
 return ['payment','deposit'].includes(value.kind)&&Number.isSafeInteger(value.amount)&&value.amount>0&&['card','ach'].includes(value.method)&&(value.method!=='ach'||value.currency==='usd');
}
export function validPaymentRecord(envelope,canonical){
 try{
  for(const [index,signer] of envelope.signers.entries()){
   const prepared=envelope.events.findLast(event=>['envelope.prepared','envelope.updated'].includes(event.action))?.detail.orderedSigners?.[index];
   if(canonical(signer.payment??null)!==canonical(prepared?.payment??null)||canonical(signer.paymentAuthority??null)!==canonical(prepared?.paymentAuthority??null))return false;
   if(signer.payment&&(!validRequirement(signer.payment)||!only(signer.paymentAuthority,['actor','at','version','buyer'])||!only(signer.paymentAuthority.buyer,['reference','name'])||!signer.paymentAuthority?.buyer?.reference||!signer.paymentAuthority.buyer.name||!signer.paymentAuthority.version||!signer.paymentAuthority.actor||!Number.isFinite(Date.parse(signer.paymentAuthority.at))))return false;
   const receipt=signer.paymentReceipt;
   if(receipt){
    if(!signer.payment||!['pending','failed','succeeded'].includes(receipt.outcome)||typeof receipt.reference!=='string'||typeof receipt.livemode!=='boolean')return false;
    if(Object.keys(receipt).some(key=>!['reference','outcome','livemode','paymentIntent','setupIntent','paymentMethod','mandate','customer'].includes(key)))return false;
    const checked=envelope.events.findLast(event=>event.action==='signer.payment_checked'&&event.detail.signer===index);
    const signed=envelope.events.findLast(event=>event.action==='signer.signed'&&event.detail.signer===index);
    if(canonical(receipt)!==canonical(signed?.detail.payment??checked?.detail.receipt))return false;
    if(checked&&canonical(checked.detail.requirement)!==canonical(signer.payment))return false;
   }
   if(signer.payment&&(signer.signedAt||signer.paper?.status==='accepted')&&receipt?.outcome!=='succeeded')return false;
  }
  return true;
 }catch{return false;}
}
