Inkwell sends a fixed PDF to each signer in turn and keeps what proves it happened: the
executed PDF, a certificate and a chained audit trail. It runs on your own computer, or on
your own Cloudflare account, and it is MIT licensed.

## How an agreement moves

Every agreement is an **envelope**: one fixed PDF, one to five recipients in signing order,
and the fields each of them fills in.

1. **Prepare.** An owner, admin or sender uploads the final PDF, adds the recipients in order and
   places signature, text and date fields on the pages. Saving prepares the envelope; it
   sends nothing yet.
2. **Approve.** A person reviews the document, the recipients and whether it is suitable
   for electronic signature, then approves it. Only then does Inkwell invite the
   recipients at the first routing order.
3. **Sign in routing order.** Each recipient opens their own private link, confirms their
   email address with a one-time code, reads the document, types their name and signs.
   Recipients who share a routing order sign at the same time; the next order is invited
   only after all of their signatures are recorded.
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
| `expired` | The envelope expired before everyone signed. The sender can extend it. |

## Find envelopes through the API

Any signed-in person can search the envelopes they may see (a sender, only their own) one page at a time with
`GET /api/inkwell/envelopes`. `q` matches the title and any recipient's name or email;
`status` is `draft`, `waiting_for_me`, `waiting_for_others`, `completed`, `declined`,
`voided`, `expired` or `imported`; `from` (inclusive) and `to` (exclusive) bound when it was
prepared; `sender` is the preparing member's ID; `preparedBy=agent` keeps envelopes a
preparation token prepared; `limit` is 1–100 (50 by default). The answer holds the page,
newest first, a count for every status under the same search, and a `next` value to pass
back as `cursor` for the following page. `GET /api/inkwell/envelopes/:id` reads one
envelope. The Envelopes screen uses the same search: its status chips, Prepared from and
to days (your own local days, both included) and, for owners and admins, the Sender filter.

## Share an envelope

The sender of an envelope, an owner or an admin can share it with another member under
**Shared with** in its panel: enter the member's email and choose **Can view** or **Can view
and edit**. A sender it is shared with to edit can approve, extend, copy, send on and void
it, but cannot share it further. A viewer always only reads. **Remove** ends a share at
once. Each share and removal appears in the audit trail.

## Reports

**Reports** shows, for the days you choose (whole days, Eastern time, both included), how
many envelopes were sent, completed, declined and expired, and the median and average
time from sending to the last signature, for each sender and in total. **Export CSV**
downloads the same numbers. A sender sees only their own envelopes. The same report is
`GET /api/inkwell/reports/envelopes?from=YYYY-MM-DD&to=YYYY-MM-DD`, and its CSV is
`/api/inkwell/reports/envelopes.csv` with the same query.

## Who can do what

| Role | Can |
| --- | --- |
| Owner | Everything: prepare, approve, void, erase, move in, back up and restore, and issue agent tokens. |
| Admin | Prepare, approve and void every envelope, and choose whether each member is a sender or a viewer. |
| Sender | Prepare, approve, copy, extend and void their own envelopes and those shared with them to edit; they also read envelopes shared with them to view, and see nothing else. |
| Viewer | Read every envelope and download its records. |

Everyone invited as a member starts as a viewer. An owner or admin makes them a sender
under **Settings → People**. Anyone, in any role, can sign their own turn. The server
checks these roles on every request, not only in the interface.

## What Inkwell does not do

Inkwell places the signer's typed name into the PDF and records the email-code check,
consent and order in its certificate. It does not apply a qualified cryptographic
signature, verify anyone's government identity, notarise documents or decide whether a
document may be signed electronically. You decide which documents are eligible.

Next: [Getting started](/docs/getting-started).
