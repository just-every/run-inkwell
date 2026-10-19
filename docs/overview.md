Inkwell sends a fixed PDF to each signer in turn and keeps what proves it happened: the
executed PDF, a certificate and a chained audit trail. It runs on your own computer, or on
your own Cloudflare account, and it is MIT licensed.

## How an agreement moves

Every agreement is an **envelope**: one fixed PDF, one to five recipients in signing order,
and the fields each of them fills in.

1. **Prepare.** An owner or admin uploads the final PDF, adds the recipients in order and
   places signature, text and date fields on the pages. Saving prepares the envelope; it
   sends nothing yet.
2. **Approve.** A person reviews the document, the recipients and whether it is suitable
   for electronic signature, then approves it. Only then does Inkwell invite the first
   recipient.
3. **Sign in order.** Each recipient opens their own private link, confirms their email
   address with a one-time code, reads the document, types their name and signs. The next
   recipient is invited only after the previous signature is recorded.
4. **Keep.** When the last person signs, the envelope is **completed**: you can download
   the executed PDF, the certificate, the audit JSON and a handoff manifest, and recheck
   every fingerprint at any time.

An unfinished envelope can be voided with a reason, and the reason stays on record.

## Envelope statuses

| Status | Meaning |
| --- | --- |
| `prepared` | Saved and waiting for a person to approve it. Nothing has been sent. |
| `awaiting signature` | Approved; a recipient has an invitation and the others wait their turn. |
| `completed` | Everyone signed. The executed PDF and certificate exist. |
| `declined` | A signer declined with a reason or withdrew consent to electronic signing; signing stopped and a certificate records it. |
| `voided` | Stopped before completion, with the reason in the audit trail. |
| `expired` | The envelope expired before everyone signed. |

## Who can do what

| Role | Can |
| --- | --- |
| Owner | Everything: prepare, approve, void, erase, move in, back up and restore, and issue agent tokens. |
| Admin | Prepare, approve and void envelopes. |
| Member | Read envelopes and download their records. |

The server checks these roles on every request, not only in the interface.

## What Inkwell does not do

Inkwell places the signer's typed name into the PDF and records the email-code check,
consent and order in its certificate. It does not apply a qualified cryptographic
signature, verify anyone's government identity, notarise documents or decide whether a
document may be signed electronically. You decide which documents are eligible.

Next: [Getting started](/docs/getting-started).
