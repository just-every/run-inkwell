import { canonical, sha256 } from './model'

/** SIGNX-005: the installation's electronic record and signature disclosure under ESIGN and UETA. Every signer agrees
 * to it before first signing; the version and the fingerprint of these exact words go into the record. A changed text
 * is a new version. */
export const disclosure = {
  version: 'inkwell-esign-2026-10-19',
  title: 'Electronic record and signature disclosure',
  sections: [
    { heading: 'Electronic records and signatures', body: 'The sender of this request asks you to receive this document and sign it electronically instead of on paper. If you agree, your electronic signature has the same effect as your handwritten signature, and the documents and notices for this request are given to you electronically.' },
    { heading: 'Getting a paper copy', body: 'You may ask the sender for a paper copy of any document in this request at any time, before or after signing, by replying to their invitation email. Asking for a paper copy does not withdraw your consent.' },
    { heading: 'Withdrawing your consent', body: 'You may withdraw your consent to electronic records and signatures before you sign, with Withdraw consent on this page. Withdrawing stops this request: nobody later in the order is invited and the sender is told. Withdrawing does not undo a signature you already gave.' },
    { heading: 'Keeping your contact details current', body: 'The sender reaches you at the email address this request was sent to. If it changes, tell the sender by replying to their invitation email.' },
    { heading: 'Hardware and software you need', body: 'A current version of Chrome, Edge, Firefox or Safari with JavaScript and cookies turned on; access to the email account this request was sent to; and a PDF reader, storage or a printer to keep copies of the documents.' },
  ],
} as const

export const disclosureStatement = 'I have read the electronic record and signature disclosure and agree to receive documents and sign electronically.'
export const disclosureSha256 = () => sha256(canonical(disclosure))
