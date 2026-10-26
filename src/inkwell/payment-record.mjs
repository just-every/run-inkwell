/** Business custody binds requirements and normalized provider outcomes to their audited public-door actions. */
export function validPaymentRecord(envelope,canonical){
 try{
  for(const [index,signer] of envelope.signers.entries()){
   const prepared=envelope.events.findLast(event=>['envelope.prepared','envelope.updated'].includes(event.action))?.detail.orderedSigners?.[index];
   if(canonical(signer.payment??null)!==canonical(prepared?.payment??null))return false;
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
