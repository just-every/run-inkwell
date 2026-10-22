/** Composed source versions and frozen approval rules are authenticated business custody. */
export function validTemplateRecord(e, canonical) {
 if(e.templates===undefined)return e.approvalRules===undefined;
 try {
  if(!Array.isArray(e.templates)||e.templates.length<2||e.templates.length>20||new Set(e.templates.map(t=>t.id)).size!==e.templates.length)return false;
  if(!e.templates.every(t=>typeof t.id==='string'&&typeof t.title==='string'&&Number.isSafeInteger(t.version)&&t.version>0))return false;
  if(canonical(e.template)!==canonical(e.templates[0]))return false;
  const prepared=e.events.find(v=>v.action==='envelope.prepared');
  return Boolean(prepared&&canonical(prepared.detail.templates)===canonical(e.templates)&&canonical(prepared.detail.approvalRules??[])===canonical(e.approvalRules??[]));
 }catch{return false;}
}
