import { canonicalJson, sha256 } from '@runeditrun/rer/modules/portability';

// The same policy drives the browser and `rer export/import`. Authentication,
// access keys, member roles, pending mail and its delivery events (DELIV-001), completed-copy links, account settings, saved signatures, envelope and template shares (TMPL-002) the contact book (ROUTE-008) and sender notifications with their choices and webhook URLs (DELIV-008) and the retention ledger (RECORD-005) are installation state;
// document custody travels. A restored member is a viewer until an owner or admin chooses.
export default {
  product: 'signatures/inkwell',
  excludeTables: ['iw_member_access', 'iw_import_retention_mail', 'iw_guards', 'iw_commands', 'iw_agents', 'iw_mail', 'iw_access_codes', 'iw_member_roles', 'iw_copy_links', 'iw_settings', 'iw_member_marks', 'iw_shares', 'iw_template_shares', 'iw_contacts', 'iw_notices', 'iw_notice_posts', 'iw_notice_prefs', 'iw_notice_channels', 'iw_retention_purges', 'ik_d1_assertions', 'rer_mail_event_receipts', 'rer_mail_event_states'],
  // SIGNX-001: a signer's saved, unsigned entries stay behind like their codes and sessions; DELIV-005: so does the sealed link.
  secretColumns: { iw_signers: ['code_hash', 'session_hash', 'progress', 'link_sealed'] },
  requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
  async validateStaged({ read }) {
    const envelopes = await read('iw_envelopes'), blobs = await read('iw_blobs'), events = await read('iw_events');
    for (const row of envelopes) {
      const e = JSON.parse(row.data);
      if (e.id !== row.id || e.version !== row.version) return false;
      let previousHash = '';
      for (let i = 0; i < e.events.length; i++) {
        const { hash, ...body } = e.events[i];
        const stored = events.find(r => r.envelope_id === e.id && r.sequence === i);
        if (body.previousHash !== previousHash || hash !== await sha256(canonicalJson(body)) || !stored || stored.hash !== hash || canonicalJson(JSON.parse(stored.data)) !== canonicalJson(e.events[i])) return false;
        previousHash = hash;
      }
      for (const [kind, fingerprint] of [['original', e.originalSha256], ['signed', e.signedSha256], ['certificate', e.certificateSha256]]) {
        if (!fingerprint) { if (kind === 'original' || (e.status === 'completed' && kind !== 'original')) return false; continue; }
        const parts = blobs.filter(r => r.envelope_id === e.id && r.kind === kind).sort((a,b) => a.part-b.part);
        if (!parts.length || parts.some((r,i) => r.part !== i || !(Array.isArray(r.data) || r.data instanceof ArrayBuffer))) return false;
        const chunks = parts.map(r => new Uint8Array(r.data));
        const bytes = new Uint8Array(chunks.reduce((n,c) => n+c.length,0)); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
        if (await sha256(bytes) !== fingerprint) return false;
      }
    }
    return true;
  },
};
