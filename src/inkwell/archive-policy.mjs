import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { validDocumentRecord } from './document-record.mjs';
import { validCommentRecords } from './comment-record.mjs';
import { validSupplementRecord } from './supplement-record.mjs';
import { stampEvidence } from './stamp-evidence.mjs';
import { canonicalJson, sha256 } from '@runeditrun/rer/modules/portability';

// The same policy drives the browser and `rer export/import`. Authentication,
// access keys, member roles, pending mail and its delivery events (DELIV-001), completed-copy links, account settings, saved signatures, envelope and template shares (TMPL-002) the contact book (ROUTE-008) and sender notifications with their choices and webhook URLs (DELIV-008) and the retention ledger (RECORD-005) are installation state;
// document custody travels. A restored member is a viewer until an owner or admin chooses.
export default {
  product: 'signatures/inkwell',
  excludeTables: ['iw_exit_%','iw_pdf_uploads','iw_pdf_upload_parts','iw_blob_staging','iw_followup_capabilities', 'iw_followup_receipts', 'iw_api_keys', 'iw_template_revisions', 'iw_member_access', 'iw_import_retention_mail', 'iw_guards', 'iw_commands', 'iw_agents', 'iw_mail', 'iw_access_codes', 'iw_member_roles', 'iw_copy_links', 'iw_settings', 'iw_freeform_history', 'iw_freeform_policy', 'iw_member_marks', 'iw_shares', 'iw_template_shares', 'iw_contacts', 'iw_notices', 'iw_notice_posts', 'iw_notice_prefs', 'iw_notice_channels', 'iw_retention_purges', 'ik_d1_assertions', 'rer_mail_event_receipts', 'rer_mail_event_states'],
  // SIGNX-001: a signer's saved, unsigned entries stay behind like their codes and sessions; DELIV-005: so does the sealed link.
  secretColumns: { iw_signers: ['code_hash', 'session_hash', 'progress', 'link_sealed'] },
  requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
  async validateStaged({ db, tables }) {
    const table=name=>tables[name] ? '"'+tables[name].replaceAll('"','""')+'"' : null;
    async function* rows(name,where='',values=[]) {
      const source=table(name);if(!source)return;
      for(let offset=0;;offset+=2){const batch=(await db.prepare(`SELECT * FROM ${source}${where?' WHERE '+where:''} ORDER BY rowid LIMIT 2 OFFSET ?`).bind(...values,offset).all()).results;if(!batch.length)break;yield* batch;}
    }
    async function fingerprint(name,where,values,expected,partColumn='part',dataColumn='data') {
      const source=table(name);if(!source)return false;
      const digest=createHash('sha256');let part=0;
      for(;;){const batch=(await db.prepare(`SELECT ${partColumn} AS part,${dataColumn} AS data FROM ${source} WHERE ${where} AND ${partColumn}>=? ORDER BY ${partColumn} LIMIT 4`).bind(...values,part).all()).results;if(!batch.length)break;
       for(const row of batch){if(row.part!==part++)return false;digest.update(new Uint8Array(row.data));}}
      return part>0&&digest.digest('hex')===expected;
    }
    for await(const row of rows('iw_envelopes')) {
      const e=JSON.parse(row.data);
      if(e.id!==row.id||e.version!==row.version||!validDocumentRecord(e,canonicalJson)||!validSupplementRecord(e,canonicalJson)||!await verifyFreeFormRecord(e))return false;
      const threads=[];for await(const r of rows('iw_comment_threads','envelope_id=?',[e.id]))threads.push(r);
      if(!await validCommentRecords(e,threads,canonicalJson,sha256))return false;
      try {for(const [index,signer] of e.signers.entries()){
        const fields=e.fields.filter(f=>f.signer===index);if(!signer.signedAt||!fields.some(f=>f.type==='stamp'&&signer.values?.[f.id]))continue;
        const signed=e.events.findLast(event=>event.action==='signer.signed'&&event.detail.signer===index);
        if(!signed||signed.detail.valuesSha256!==await sha256(canonicalJson(signer.values)))return false;
        const stamps=await stampEvidence(fields,signer.values);if(signed.detail.stamps!==undefined&&canonicalJson(signed.detail.stamps)!==canonicalJson(stamps))return false;
      }}catch{return false;}
      let previousHash='',index=0;for await(const stored of rows('iw_events','envelope_id=?',[e.id])){
        const event=e.events[stored.sequence];if(!event||stored.sequence!==index++||canonicalJson(JSON.parse(stored.data))!==canonicalJson(event)||stored.hash!==event.hash)return false;
        const {hash,...body}=event;if(body.previousHash!==previousHash||hash!==await sha256(canonicalJson(body)))return false;previousHash=hash;
      }
      if(index!==e.events.length)return false;
      const artifacts=[['original',e.originalSha256],['signed',e.signedSha256],['certificate',e.certificateSha256],...(e.supplements??[]).map(s=>[`supplement-${s.id}`,s.sha256]),...(e.documents??[]).flatMap((d,i)=>[[`document-${i}`,d.sha256],[`executed-${i}`,d.signedSha256]]),...e.signers.flatMap((s,i)=>[...(s.paper?[['paper-'+i,s.paper.sha256]]:[]),...(s.adoption?.sha256?[['mark-'+i,s.adoption.sha256]]:[]),...(s.initialsAdoption?.sha256?[['initials-'+i,s.initialsAdoption.sha256]]:[])])];
      for(const [kind,hash] of artifacts){if(!hash){if(kind==='original'||e.status==='completed')return false;continue;}if(!await fingerprint('iw_blobs','envelope_id=? AND kind=?',[e.id,kind],hash))return false;}
    }
    for await(const row of rows('iw_templates')){
      const t=JSON.parse(row.data);
      if(!await fingerprint('iw_template_blobs','template_id=?',[row.id],t.originalSha256))return false;
      for(const s of t.supplements??[])if(!await fingerprint('iw_template_supplement_blobs','template_id=? AND supplement_id=?',[row.id,s.id],s.sha256))return false;
      for(const [i,d] of (t.documents??[]).entries())if(!await fingerprint('iw_template_document_blobs','template_id=? AND document=?',[row.id,i],d.sha256))return false;
    }
    for await(const row of rows('iw_imported_archives')){
      const record=JSON.parse(row.value);for(const file of record.files??[]){const bytes=Buffer.from(file.base64,'base64');if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)return false;}
    }
    for await(const row of rows('ik_originals')){
      if(row.bytes!==null&&row.bytes!==undefined){if(createHash('sha256').update(new Uint8Array(row.bytes)).digest('hex')!==row.sha256)return false;}
      else if(table('ik_d1_original_chunks')){const available=await db.prepare(`SELECT 1 FROM ${table('ik_d1_original_chunks')} WHERE job_id=? AND kind=? AND original_key=? LIMIT 1`).bind(row.job_id,row.kind,row.original_key).first();if(available&&!await fingerprint('ik_d1_original_chunks','job_id=? AND kind=? AND original_key=?',[row.job_id,row.kind,row.original_key],row.sha256,'ordinal','bytes'))return false;}
    }
    return true;
  },
};

/** PREP-011: custody validation shared with live verification. The signed values digest binds the
 * complete placement, including ownership and geometry, and the setting snapshot authorizing it. */
export async function verifyFreeFormRecord(e) {
  try {
    const signedEvents = e.events.filter(event => event.action === 'signer.signed');
    if (!e.freeForm) return !signedEvents.some(event => event.detail.freeForm === true);
    const setting = e.freeFormSetting;
    if (!setting) return e.fields.length === 0 && signedEvents.length === 0 && !e.signers.some(signer => signer.signedAt) && !e.events.some(event => event.action === 'envelope.sent_scheduled' || event.action === 'envelope.approved' && !event.detail.approvedForLater);
    if (!setting || !Number.isInteger(setting.version) || setting.version < 1 || typeof setting.actor !== 'string' || !setting.actor || !Number.isFinite(Date.parse(setting.at))) return false;
    const ids = new Set();
    for (const f of e.fields) {
      if (!f || !e.signers[f.signer]?.signedAt || !Number.isInteger(f.signer) || ids.has(f.id) || typeof f.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(f.id)) return false;
      ids.add(f.id);
      if (!['signature', 'initials', 'date_signed', 'full_name', 'text'].includes(f.type) || typeof f.label !== 'string' || !f.label.trim() || f.label.length > 100 || /[\x00-\x1f\x7f]/.test(f.label)) return false;
      if (!Number.isInteger(f.page) || f.page < 0 || f.page >= e.pageSizes.length || ![f.x, f.y, f.width, f.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) || f.width <= 0 || f.height <= 0 || f.x + f.width > 1.000001 || f.y + f.height > 1.000001) return false;
    }
    for (const [index, signer] of e.signers.entries()) {
      const fields = e.fields.filter(field => field.signer === index);
      if (!signer.signedAt) { if (fields.length) return false; continue; }
      if (signer.paper?.status === 'accepted') { if (fields.length) return false; continue; }
      if (fields.length > 100 || !fields.some(field => field.type === 'signature' && signer.values?.[field.id])) return false;
      const signed = signedEvents.findLast(event => event.detail.signer === index);
      if (!signed || signed.detail.freeForm !== true || canonicalJson(signed.detail.freeFormSetting) !== canonicalJson(setting)) return false;
      if (signed.detail.valuesSha256 !== await sha256(canonicalJson({ fields, values: signer.values, freeFormSetting: setting }))) return false;
      if (Object.keys(signer.values ?? {}).some(id => !fields.some(field => field.id === id))) return false;
      if (fields.some(a => e.fields.some(b => b.signer !== index && a.page === b.page && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y))) return false;
    }
    return true;
  } catch { return false; }
}
