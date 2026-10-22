/** Archived and live evidence use the same binding to the hash-chained signature event. */
export function validPart11Record(e,canonical) {
 try {
  if(!e.part11)return !e.signers.some(s=>s.part11) && !e.events.some(v=>v.detail?.part11)
  if(typeof e.part11.actor!=='string'||!e.part11.actor||!Number.isFinite(Date.parse(e.part11.at))||e.allowPaper)return false
  if(!e.events.some(v=>['envelope.prepared','envelope.updated','envelope.part11_enabled'].includes(v.action)&&v.detail?.part11&&canonical(v.detail.part11)===canonical(e.part11)))return false
  return e.signers.every((s,i)=>{
   if(!s.signedAt)return !s.part11
   const p=s.part11, event=e.events.findLast(v=>v.action==='signer.signed'&&v.detail.signer===i)
   const name=s.group?.signedBy===undefined?s.name:s.group.members[s.group.signedBy].name
   return p&&event&&['Approval','Review','Authorship'].includes(p.reason)&&p.name===name&&p.method==='single-use emailed code'&&Number.isFinite(Date.parse(p.reauthenticatedAt))&&p.reauthenticatedAt<=s.signedAt&&canonical(event.detail.part11)===canonical(p)
  })
 }catch{return false}
}
