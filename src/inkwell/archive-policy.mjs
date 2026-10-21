import { validSupplementRecord } from './supplement-record.mjs';
import { stampEvidence } from './stamp-evidence.mjs';
import { canonicalJson, sha256 } from '@runeditrun/rer/modules/portability';

// The same policy drives the browser and `rer export/import`. Authentication,
// access keys, member roles, pending mail and its delivery events (DELIV-001), completed-copy links, account settings, saved signatures, envelope and template shares (TMPL-002) the contact book (ROUTE-008) and sender notifications with their choices and webhook URLs (DELIV-008) and the retention ledger (RECORD-005) are installation state;
// document custody travels. A restored member is a viewer until an owner or admin chooses.
export default {
  product: 'signatures/inkwell',
  excludeTables: ['iw_template_revisions', 'iw_member_access', 'iw_import_retention_mail', 'iw_guards', 'iw_commands', 'iw_agents', 'iw_mail', 'iw_access_codes', 'iw_member_roles', 'iw_copy_links', 'iw_settings', 'iw_freeform_history', 'iw_freeform_policy', 'iw_member_marks', 'iw_shares', 'iw_template_shares', 'iw_contacts', 'iw_notices', 'iw_notice_posts', 'iw_notice_prefs', 'iw_notice_channels', 'iw_retention_purges', 'ik_d1_assertions', 'rer_mail_event_receipts', 'rer_mail_event_states'],
  // SIGNX-001: a signer's saved, unsigned entries stay behind like their codes and sessions; DELIV-005: so does the sealed link.
  secretColumns: { iw_signers: ['code_hash', 'session_hash', 'progress', 'link_sealed'] },
  requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
  async validateStaged({ read }) {
    const envelopes = await read('iw_envelopes'), blobs = await read('iw_blobs'), events = await read('iw_events');
    for (const row of envelopes) {
      const e = JSON.parse(row.data);
      if (e.id !== row.id || e.version !== row.version || !validSupplementRecord(e, canonicalJson) || !await verifyFreeFormRecord(e)) return false;
      // PREP-003: recompute image type, bytes, fingerprint and provenance from signed values.
      // Older records bind the same values with valuesSha256; they retain their original audit/certificate.
      try {
        for (const [index, signer] of e.signers.entries()) {
          const fields = e.fields.filter(f => f.signer === index);
          if (!signer.signedAt || !fields.some(f => f.type === 'stamp' && signer.values?.[f.id])) continue;
          const signed = e.events.findLast(event => event.action === 'signer.signed' && event.detail.signer === index);
          if (!signed || signed.detail.valuesSha256 !== await sha256(canonicalJson(signer.values))) return false;
          const stamps = await stampEvidence(fields, signer.values);
          if (signed.detail.stamps !== undefined && canonicalJson(signed.detail.stamps) !== canonicalJson(stamps)) return false;
        }
      } catch { return false; }
      let previousHash = '';
      for (let i = 0; i < e.events.length; i++) {
        const { hash, ...body } = e.events[i];
        const stored = events.find(r => r.envelope_id === e.id && r.sequence === i);
        if (body.previousHash !== previousHash || hash !== await sha256(canonicalJson(body)) || !stored || stored.hash !== hash || canonicalJson(JSON.parse(stored.data)) !== canonicalJson(e.events[i])) return false;
        previousHash = hash;
      }
      for (const [kind, fingerprint] of [['original', e.originalSha256], ['signed', e.signedSha256], ['certificate', e.certificateSha256], ...(e.supplements ?? []).map(s => [`supplement-${s.id}`, s.sha256])]) {
        if (!fingerprint) { if (kind === 'original' || (e.status === 'completed' && kind !== 'original')) return false; continue; }
        const parts = blobs.filter(r => r.envelope_id === e.id && r.kind === kind).sort((a,b) => a.part-b.part);
        if (!parts.length || parts.some((r,i) => r.part !== i || !(Array.isArray(r.data) || r.data instanceof ArrayBuffer))) return false;
        const chunks = parts.map(r => new Uint8Array(r.data));
        const bytes = new Uint8Array(chunks.reduce((n,c) => n+c.length,0)); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
        if (await sha256(bytes) !== fingerprint) return false;
      }
    }
    const templates = await read('iw_templates'), templateBlobs = await read('iw_template_supplement_blobs');
    for (const row of templates) for (const s of JSON.parse(row.data).supplements ?? []) {
      const parts = templateBlobs.filter(r => r.template_id === row.id && r.supplement_id === s.id).sort((a,b) => a.part-b.part);
      if (!parts.length || parts.some((r,i) => r.part !== i)) return false;
      const chunks = parts.map(r => new Uint8Array(r.data)), bytes = new Uint8Array(chunks.reduce((n,c) => n+c.length,0));
      let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      if (bytes.length !== s.bytes || await sha256(bytes) !== s.sha256) return false;
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
