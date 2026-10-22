/** Recipient delegation is an audited projection of sender-granted stable places, never an account permission. */
export function validDelegationRecord(envelope, canonical) {
 try {
  const delegated = s => ['specify_recipients','editor'].includes(s?.role);
  if (!envelope.signers.some(s=>delegated(s)||s.delegates||s.unresolvedIdentity) && !envelope.events.some(e=>e.detail?.byRecipient!==undefined||['recipient.specified','recipient.edited'].includes(e.action))) return true;
  let people, fields=[], documents; const activated=new Set(), acted=new Set(), removed=new Set(), skipped=new Set(), completed=new Map(), pending=new Map(), pendingIdentities=new Map();
  const same=(a,b)=>canonical(a)===canonical(b), order=i=>people[i].order??i+1;
  const immutable=['role','order','linkOnly','inPerson','accessCode','witnesses','includeWhen','delegates'];
  const projection=s=>({name:s.name,email:s.email,...Object.fromEntries(immutable.map(key=>[key,s[key]])),...(s.phone?{phone:s.phone}:{}),...(s.sms?{sms:true}:{}),...(s.message?{message:s.message}:{}),...(s.unresolvedIdentity?{unresolvedIdentity:true}:{})});
  const documentDefinition=value=>value?.map(({signedSha256:_signed,...document})=>document)??null;
  const canSee=(place,page)=>!documents||documents.some(d=>page>=d.pageStart&&page<d.pageStart+d.pages&&(!d.visibleTo||d.visibleTo.signers.includes(place)));
  const shared=(actor,target,page)=>Number.isInteger(page)&&page>=0&&page<envelope.pageSizes.length&&canSee(actor,page)&&canSee(target,page);
  const active=i=>delegated(people?.[i])&&activated.has(i)&&!acted.has(i)&&!removed.has(i)&&!skipped.has(i);
  const targetAllowed=(actor,target)=>Number.isInteger(target)&&people[target]&&people[actor].delegates?.includes(target)&&order(target)>order(actor)&&!acted.has(target)&&!activated.has(target)&&!removed.has(target)&&!skipped.has(target)&&!people[target].group&&!people[target].inPerson&&people[target].witnessFor===undefined;
  const ownEvent=(event,index)=>event.actor===`signer:${index+1}`;
  const changePending=(event,index)=>{const current=pending.get(index);if(current&&current!==event.at)return false;pending.set(index,event.at);return true;};
  const apply=(person,before,after)=>{for(const key of new Set([...Object.keys(before),...Object.keys(after)])){if(Object.hasOwn(after,key))person[key]=structuredClone(after[key]);else delete person[key];}};
  for(const event of envelope.events){
   const detail=event.detail??{},index=detail.signer;
   if(detail.byRecipient!==undefined&&!['signer.corrected','envelope.corrected'].includes(event.action))return false;
   if(['envelope.prepared','envelope.updated'].includes(event.action)){
    if(completed.size||pending.size||!Array.isArray(detail.orderedSigners)||!Array.isArray(detail.fields))return false;
    people=structuredClone(detail.orderedSigners);fields=structuredClone(detail.fields);documents=structuredClone(detail.documents);activated.clear();acted.clear();removed.clear();skipped.clear();
    for(const [i,s]of people.entries()){
     if(delegated(s)!==Boolean(s.delegates?.length))return false;
     if(s.delegates&&(!Array.isArray(s.delegates)||new Set(s.delegates).size!==s.delegates.length))return false;
     for(const place of s.delegates??[])if(!Number.isInteger(place)||!people[place]||order(place)<=order(i)||people[place].group||people[place].inPerson||delegated(people[place])||people[place].role==='witness')return false;
     if(s.unresolvedIdentity&&(s.name||s.email||s.sms||s.phone||s.accessCode||s.linkOnly||s.inPerson||s.group||!people.some((agent,j)=>agent.role==='specify_recipients'&&agent.delegates?.includes(i)&&order(j)<order(i))))return false;
    }
    continue;
   }
   if(!people)return false;
   if(event.action==='witness.activated'){if(detail.witness!==people.length||!detail.recipient||!Array.isArray(detail.fields))return false;people.push(structuredClone(detail.recipient));fields.push(...structuredClone(detail.fields));}
   if(event.action==='witness.declined'){removed.add(detail.witness);fields=fields.filter(field=>field.signer!==detail.witness);}
   if(envelope.freeForm&&event.action==='signer.signed'&&detail.freeForm)fields.push(...structuredClone(envelope.fields.filter(field=>field.signer===index)));
   if(event.action==='signer.route_activated')activated.add(index);
   if(event.action==='signer.route_skipped')skipped.add(index);
   if(event.action==='signer.removed')removed.add(index);
   if(event.action==='signer.added'){if(!detail.after||index!==people.length)return false;people.push(structuredClone(detail.after));}
   if(event.action==='document.audience_updated'){if(!same(documentDefinition(detail.before),documentDefinition(documents)))return false;documents=structuredClone(detail.after);}
   if(['signer.corrected','signer.reassigned'].includes(event.action)){
    const person=people[index],before=detail.before,after=detail.after;if(!person||!before||!after)return false;
    for(const key of Object.keys(before))if(!same(person[key],before[key]))return false;
    if(detail.byRecipient!==undefined){
     const actor=detail.byRecipient,agent=people[actor];
     if(!active(actor)||!ownEvent(event,actor)||!targetAllowed(actor,index)||!changePending(event,actor)||!same(before,projection(person)))return false;
     if(Object.keys(after).some(key=>!['name','email','phone','sms','message','unresolvedIdentity',...immutable].includes(key))||immutable.some(key=>!same(before[key],after[key]))||after.unresolvedIdentity||!after.name?.trim()||/[\r\n\t]/.test(after.name)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(after.email)||after.email!==after.email.toLowerCase()||Boolean(after.sms)!==Boolean(person.sms))return false;
     if(after.phone&&!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(after.phone))return false;
     if(agent.role==='specify_recipients'&&(!person.unresolvedIdentity||person.sms||person.phone||person.linkOnly||person.accessCode||!same(before.message,after.message)))return false;
     pendingIdentities.set(actor,new Set([...(pendingIdentities.get(actor)??[]),index]));
    }else if(event.actor?.startsWith('signer:')&&(event.action!=='signer.reassigned'||!ownEvent(event,index)||!envelope.allowReassign||delegated(person)||!activated.has(index)||acted.has(index)))return false;
    apply(person,before,after);
   }
   if(event.action==='envelope.corrected'&&detail.changes?.fields){
    const change=detail.changes.fields;if(!Array.isArray(change.before)||!Array.isArray(change.after)||!same(change.before,fields))return false;
    if(detail.byRecipient!==undefined){
     const actor=detail.byRecipient;
     if(!active(actor)||people[actor].role!=='editor'||!ownEvent(event,actor)||Object.keys(detail.changes).some(key=>key!=='fields')||!changePending(event,actor))return false;
     const next=new Map(change.after.map(field=>[field.id,field]));if(next.size!==change.after.length||fields.some(field=>!next.has(field.id)))return false;
     for(const field of change.after){
      const original=fields.find(old=>old.id===field.id);if(original&&same(original,field))continue;
      if(original&&(!targetAllowed(actor,original.signer)||!shared(actor,original.signer,original.page)))return false;
      if(!targetAllowed(actor,field.signer)||!shared(actor,field.signer,field.page))return false;
      const targetRole=people[field.signer].role??'signer';if(!['signer','form_filler'].includes(targetRole)||targetRole==='form_filler'&&['signature','initials','stamp'].includes(field.type))return false;
      const dependencies=[field.condition?.field,field.requiredWhen?.field,...(field.calculation?.fields??[])].filter(Boolean);
      if(dependencies.some(id=>!change.after.some(source=>source.id===id&&targetAllowed(actor,source.signer)&&shared(actor,source.signer,source.page))))return false;
     }
     if(envelope.freeForm&&!same(change.before,change.after))return false;
    }else if(event.actor?.startsWith('signer:'))return false;
    fields=structuredClone(change.after);
   }else if(event.action==='envelope.corrected'&&detail.byRecipient!==undefined)return false;
   if(['recipient.specified','recipient.edited'].includes(event.action)){
    const person=people[index],role=event.action==='recipient.specified'?'specify_recipients':'editor';
    if(!active(index)||person.role!==role||detail.role!==role||detail.email!==person.email||detail.consent!==true||!ownEvent(event,index)||completed.has(index)||pending.has(index)&&pending.get(index)!==event.at)return false;
    if(!Array.isArray(detail.recipients)||new Set(detail.recipients).size!==detail.recipients.length||detail.recipients.some(place=>!targetAllowed(index,place)))return false;
    if(role==='specify_recipients'&&(person.delegates??[]).some(place=>targetAllowed(index,place)&&people[place].unresolvedIdentity))return false;
    if([...(pendingIdentities.get(index)??[])].some(place=>!detail.recipients.includes(place)))return false;
    completed.set(index,{at:event.at,email:detail.email,role});pending.delete(index);pendingIdentities.delete(index);acted.add(index);
   }
   if(['signer.signed','signer.signed_on_paper','recipient.approved','recipient.filled','recipient.viewed','recipient.delivered','recipient.certified_delivered'].includes(event.action))acted.add(index);
  }
  if(!people||pending.size)return false;
  for(const [i,person]of people.entries()){
   const current=envelope.signers[i];if(!current||!same(current.delegates??null,person.delegates??null)||Boolean(current.unresolvedIdentity)!==Boolean(person.unresolvedIdentity)||!same(projection(current),projection(person))||(current.role??'signer')!==(person.role??'signer'))return false;
   if(delegated(current)&&((current.completedAt??null)!==(completed.get(i)?.at??null)||current.signedAt||completed.has(i)&&(completed.get(i).email!==current.email||completed.get(i).role!==current.role)))return false;
  }
  return same(fields,envelope.fields)&&same(documentDefinition(documents),documentDefinition(envelope.documents));
 }catch{return false;}
}
