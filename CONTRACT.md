# Inkwell contract

Target edition: 17 October 2026. This contract describes the product Inkwell is being built towards and marks how close the current code is (see [Status](#status)). It is a target, not a release verdict: `ACCEPTANCE.md` lists every clause's acceptance evidence and decides acceptance. Clause IDs never change. This documentation round changes no homepage, interface or runtime behaviour.

## Product target

Inkwell is the owned electronic signature platform a US business buys instead of Docusign eSignature, Adobe Acrobat Sign or Dropbox Sign: reusable templates, any number of recipients with flexible routing, automatic reminders and real delivery operations, bulk send and public signing forms, signer identity options, an API with embedded signing and completion webhooks, and completed documents pushed back to the CRM, file store and contract repository the business already runs on. It is installed on the buyer's own Cloudflare account, with no per-envelope or per-seat fees.

| | |
| --- | --- |
| Category | Electronic signature software |
| Incumbents a buyer switches from | Docusign eSignature, Adobe Acrobat Sign, Dropbox Sign |
| Up-and-comers it must also beat | Documenso, DocuSeal |
| First buyer | An operations manager at a US service business of 10 to 100 people who sends recurring customer, supplier and employee agreements (service agreements, NDAs, W-9 and onboarding packets, offer letters); costs in USD, no per-envelope pricing, the buyer's own Cloudflare account |
| What switching means | Their templates, completed envelopes and certificates arrive from the incumbent with an explicit list of what did not map; every daily job (prepare, route, chase, sign, file, report) has an Inkwell equivalent; their CRM, file store, mailbox, automation and payment accounts plug in; their admins keep roles, SSO, branding, audit and API access |

A buyer replacing an incumbent needs the whole job, so the target is the whole job:

- **Prepare.** PDF and Word uploads, multi-document envelopes, the complete field set with validation, conditional and calculated fields, AI field and recipient detection, text tags and prefill from business data (`PREP-*`), copying an earlier envelope, and reusable shared templates with saved roles, combined several to an envelope and matched on upload (`TMPL-*`).
- **Route.** Signing your own document with nobody else involved; any number of signers, approvers, form fillers, witnesses, editors, specify-recipients agents, viewers and copy recipients, each seeing only their own documents; sequential, parallel, mixed and conditional order; signing groups, delegation, in-person signing and a contact book (`ROUTE-*`).
- **Sign.** Guided, accessible, mobile-first signing with drawn, typed or uploaded signatures and initials, ESIGN/UETA consumer disclosure, decline, download, print and paper signing, comments and supplemental documents, branding and Spanish (`SIGNX-*`), with email code, access code, SMS code, knowledge-based and phone authentication and provider identity verification (`IDV-*`), and payment at signing through Stripe (`INTEG-010`).
- **Follow through.** Delivery status, bounce handling, automatic reminders, configurable expiry, resend by email or SMS, envelope correction, completed copies to every party and sender notifications (`DELIV-*`).
- **Scale.** Bulk send from a spreadsheet and public signing web forms (`BULK-001`, `FORM-001`).
- **Keep the record.** An envelope dashboard with search, folders, custom fields, reports and a per-recipient timeline (`MANAGE-*`); a certificate of completion with per-recipient evidence, a sealed PDF, public verification and retention rules (`RECORD-*`).
- **Administer.** Roles, envelope sharing, SSO and SCIM, account defaults, an account audit log, transparent usage and a first-day readiness check (`ADMIN-*`), with optional compliance profiles (`COMPLY-*`).
- **Connect.** A REST API, webhooks, embedded signing and sending, SDKs and a test mode (`API-*`); HubSpot, Salesforce, Orbit, Google Workspace, Microsoft 365, Box, Dropbox, Chest, Locket, Zapier, Make, Power Automate, n8n and Crank (`INTEG-*`).
- **Anywhere.** The responsive web app and native iOS and Android apps (`MOBILE-*`).
- **Move in and out.** Docusign, Adobe Acrobat Sign, Dropbox Sign, Documenso and DocuSeal imports with ownership carried over, throttled and resumable at real account size, cutover of in-flight envelopes, API compatibility for common calls, and complete exports (`MOVE-*`, `PORT-*`).
- **Push further.** Agents that assemble the envelope from CRM and email context, fill what is missing, chase stalled signers under the sender's rules, verify that every party signed the intended revision and then update the CRM, contract repository and next task (`AGENT-*`).

### Neighbouring products stay separate

Inkwell is one product. Where the market sells a neighbouring product separately, Inkwell connects to it and does not rebuild it; when the neighbour is a Run Edit Run sibling, Inkwell links to that sibling first and to the US incumbent second.

| Job | Owned by | How Inkwell meets it |
| --- | --- | --- |
| Contract drafting, negotiation, clause policy, repository and obligations (renewal notices) | [Locket](https://github.com/just-every/run-locket) (or Ironclad, Icertis) | Locket starts signature in Inkwell and receives the completed record (`INTEG-008`); Inkwell signs the exact revision Locket approved (`AGENT-004`) |
| Proposals, quotes, pricing tables and content libraries | [Platter](https://github.com/just-every/run-platter) (or PandaDoc, Proposify) | Platter sends its accepted proposal through Inkwell's API for signature (`INTEG-011`) |
| Customer records and deals | [Orbit](https://github.com/just-every/run-orbit) (or HubSpot, Salesforce) | Send from a deal, prefill from its record and write status back (`INTEG-001` to `INTEG-003`) |
| File storage and sharing | [Chest](https://github.com/just-every/run-chest) (or Google Drive, OneDrive, Box, Dropbox) | Pick sources and file completed records (`INTEG-004` to `INTEG-007`) |
| Workflow automation across apps | [Crank](https://github.com/just-every/run-crank) (or Zapier, Make, Power Automate) | Triggers and actions in each (`INTEG-009`) |
| Standalone forms and surveys | [Pencil](https://github.com/just-every/run-pencil) (or Typeform, Jotform) | Not rebuilt; Inkwell's web forms exist only to sign an agreement (`FORM-001`) |
| Subscription billing and invoicing | [Nectar](https://github.com/just-every/run-nectar) and [Pantry](https://github.com/just-every/run-pantry) (or Stripe Billing, QuickBooks Online) | A payment at signing is processed by Stripe (`INTEG-010`); recurring billing starts in Nectar from the completed record (`AGENT-005`) |
| Identity provider | [Auth](https://github.com/just-every/run-auth) (or Okta, Microsoft Entra ID, Google Workspace) | SSO and SCIM client (`ADMIN-003`) |
| Team chat | [Nook](https://github.com/just-every/run-nook) (or Slack, Microsoft Teams) | Sender notifications (`DELIV-008`) |
| Offer letters, HR onboarding packets and leases | [Lodge](https://github.com/just-every/run-lodge), [Willow](https://github.com/just-every/run-willow), [Terrace](https://github.com/just-every/run-terrace) | Each sends its documents through Inkwell's API and receives the completed record (`INTEG-011`) |

### How to read this contract

- **Published clauses** are the clauses under [Shipped guarantees](#shipped-guarantees). The seed's previous contract and ACCEPTANCE.md first-release jobs already promised them; they are restated here with IDs as one part of the full job.
- **Target clauses** are under [Target clauses](#target-clauses) and **push-further clauses** under [Push further](#push-further). They are binding product requirements that a build round works towards.
- **Status** is `done`, `partial` or `missing`, judged from the code and tests at the commit named in [Status](#status). `done` means the behaviour ships and a cited test exercises it; `partial` means some of it ships, or there is code without a requirement-level test; `missing` means there is no implementation. Status is a build-planning judgement, not acceptance.
- Every acceptance journey runs through a public door: the browser at 1440 and 390 pixels wide, the HTTP API, a signing link, or a provider fake at the paid or network edge (mail, SMS, identity, payment, CRM, storage). Live provider receipt is recorded separately and never inferred from a fake.

## Shipped guarantees

### Routing and access

- **HTTP-001 — Health, API and document routing.** `/health` includes deployment identity; Hono owns `/api/*`, and Start serves application documents. Unknown routes return 404. **Acceptance evidence:** the built Worker answers `/health` with its deployment fingerprint, source and version, serves the application document, and returns 404 for unknown routes.

- **ACCESS-001 — Server-side roles and scoped authority.** Private API handlers authorize the native session and role on every request: owners and admins prepare, approve and void; members read; only the owner manages agent tokens, archives and erasure. A preparation token may only prepare. Changes require the application's own origin. Every write rechecks the actor's current role, session and the record's version in the same atomic D1 batch. **Acceptance evidence:** signed-out, member, admin, owner and agent-token requests to every document, import, agent and archive door return the documented allow or refuse, and a cross-origin change is refused.

### Sending and signing

- **SEND-001 — Prepare a fixed PDF for ordered signers.** An owner or admin uploads one PDF, places signature, text and date fields for each of up to five ordered signers, and saves a prepared envelope bound to the PDF's SHA-256. Sending requires an explicit human approval that the document is eligible for electronic signature; recipients and fields are immutable after preparation. **Acceptance evidence:** prepare an envelope through the API, fail approval without the eligibility confirmation, approve it, and show recipients and fields cannot change afterwards.

- **SIGN-001 — Email-verified, consented, ordered signing.** Each signer opens a single-use link, verifies their mailbox with a six-digit code (one-minute resend spacing, ten-minute expiry, five attempts), reviews the exact approved bytes, completes exactly their fields and consents explicitly before signing. Only the current signer in order can sign; the next invitation is sent when they finish. **Acceptance evidence:** two signers verify codes, reject a wrong code, cannot sign out of turn, consent and sign in order, and the second invitation arrives only after the first signature.

- **SEND-002 — Void an unfinished envelope.** An owner or admin voids a prepared or partially signed envelope with a reason; outstanding links, codes and signer sessions stop working immediately and pending mail is cancelled. **Acceptance evidence:** void an envelope after sending and show the invitation link refuses and the pending message is cancelled.

- **DELEGATE-001 — Preparation agents never send.** The owner issues and revokes scoped agent tokens. An agent prepares an envelope through the API; only a signed-in person approves sending, and both preparation and approval are in the audit trail with their actors. A revoked token loses all authority. **Acceptance evidence:** an agent token prepares an envelope but cannot approve, sign or read archives, and fails after revocation; the audit trail names the agent and the approving person.

### Execution records

- **RECORD-001 — Executed PDF, certificate and verifiable audit trail.** On the last signature Inkwell produces the executed PDF with the signed values, a completion certificate and a hash-chained audit trail; the sender downloads the original, executed PDF, certificate, audit JSON and a handoff manifest, and verification recomputes every fingerprint and the event chain. Signers download the executed PDF and certificate after completion. **Acceptance evidence:** complete an envelope, download every artifact, and show recomputed document and audit fingerprints agree with the stored values and the handoff manifest.

### Moving in, backup and erasure

- **MOVE-001 — DocuSeal archive move-in.** The owner previews a DocuSeal completed-submission archive without writes, approves its fingerprint, imports signed PDFs and provider evidence with their provider provenance, reads the durable import journal, downloads imported artifacts and undoes the import. **Acceptance evidence:** dry run, fingerprint approval, import, journal, downloads and undo of the DocuSeal fixture, with custody preserved at every step.

- **PORT-001 — Whole-installation export and restore.** The owner exports a checksum-bound archive of all envelopes, artifacts and import journals and restores it only into an empty installation. **Acceptance evidence:** export validates its contents, a populated installation refuses restore, and a fresh installation restores the executed file, certificate and full import journal.

- **ERASE-001 — Erasure with a restore fence.** The owner erases a voided, expired or completed native envelope after typing ERASE; its files, recipients, mail and command results are removed, and the later erasure journal stops an older backup from restoring it. **Acceptance evidence:** erase an envelope, show its files and identity custody are gone, and show a fresh-store restore with the later journal refuses resurrection while restoring everything else.

## Target clauses

### Documents and fields

- **PREP-001 — PDF and Word uploads at business size.** A sender uploads PDF, DOCX, DOC, RTF, TXT, PNG and JPEG sources up to 25 MB each; non-PDF files are converted to PDF by an isolated conversion service before preparation, and the converted PDF is what every signer sees and what the envelope's fingerprint binds. Encrypted, corrupt or unsupported files are refused with a reason. Files are stored in object storage, not in database rows. **Acceptance evidence:** upload a 20 MB PDF, a DOCX with tables and images, and a phone photo of a page; each converts, previews and signs with a fingerprint over the converted PDF; an encrypted PDF and a 30 MB file are refused with their reasons.

- **PREP-002 — Multi-document envelopes.** One envelope holds up to 20 documents and 100 MB in total, in an order the sender sets; fields reference a document and page, signers sign all of them in one session, and the executed record keeps each document separately and as one combined PDF. A document can be marked optional to sign or view-only. **Acceptance evidence:** send an envelope with a service agreement, a W-9 and a view-only policy; two signers complete it in one session each; the record contains three executed documents, a combined PDF and one certificate covering all three fingerprints.

- **PREP-003 — The complete field set with validation.** Fields include signature, initials, date signed (filled automatically in the signer's US time zone), full name, email, company, title, text, number, checkbox, checkbox group with minimum and maximum, radio group, dropdown, attachment upload, stamp, and a note; each can be required or optional, read-only or editable, and validated by pattern (US phone, ZIP, SSN or EIN masked on display, email, currency in USD, date format). **Acceptance evidence:** a template with every field type is signed on desktop and phone; invalid ZIP, phone and EIN values are refused with field-level messages; attachments land in the record; masked values are hidden in the dashboard but present in the executed PDF.

- **PREP-004 — Conditional and calculated fields.** A field can be shown, required or hidden based on another field's value (for example, "Other" reveals a text field), and a number field can be calculated from others (totals in USD). Hidden fields are never required and never printed. **Acceptance evidence:** a signer checks a box that reveals two required fields, then unchecks it and finishes without them; a calculated total updates live and prints in the executed PDF.

- **PREP-005 — Direct field placement and editing.** The sender places fields by click or drag on page thumbnails and the full page, resizes, duplicates, aligns and moves them between signers, assigns them by colour, and sets each field's properties; keyboard users place and move fields with arrow keys. **Acceptance evidence:** at 1440 and 390 pixels, place twelve fields across three pages by pointer and by keyboard, duplicate one to every page, reassign two to another signer, and save without losing a field.

- **PREP-006 — AI field and recipient detection.** On upload, Inkwell proposes fields (signature lines, dates, name and title blocks, checkboxes, initials on every page) and recipients (parties named in the document, matched to contacts and CRM records), each with its location and confidence, using the buyer's configured AI provider. The sender accepts, edits or rejects each proposal; nothing is sent from a proposal alone. **Acceptance evidence:** upload an unmarked two-party service agreement; at least the two signature blocks, dates and printed names are proposed in the right places and parties; the sender rejects one, accepts the rest and the envelope records which fields came from detection.

- **PREP-007 — Text tags and existing PDF form fields.** Text tags in the document (for example `{{signature:1}}` or Docusign-style anchor strings) and existing AcroForm fields become Inkwell fields automatically, with their names kept for API prefill. **Acceptance evidence:** a DOCX with text tags and a fillable IRS W-9 PDF both prepare with no manual placement, and the W-9's named fields prefill through the API.

- **PREP-008 — Prefill from business data.** Fields can be filled by the sender before sending, merged from a CRM record or API payload, or locked as read-only for the signer; each prefilled value records its source. **Acceptance evidence:** send from a template with a HubSpot-fake deal; company, address and amount prefill with their source shown in the record, and the signer cannot change the locked amount.

- **PREP-009 — Messages, drafts and scheduled sending.** The sender sets the email subject and message for the envelope and a private message per recipient, saves a draft and returns to it, and schedules sending for a future date and time in a US time zone. **Acceptance evidence:** save a draft, reopen it, add private messages, schedule it for the next business day at 9:00 America/Chicago and show it sends then with each recipient seeing only their own private message.

- **PREP-010 — Copy an envelope.** From any sent, completed, declined, voided or expired envelope the sender can see, Copy creates a new draft with the same documents (the original, unsigned bytes), recipients, fields, messages and settings, without any entered values or signatures; the new envelope records the envelope it was copied from. **Acceptance evidence:** copy a completed envelope; the draft has the unsigned documents, the same recipients and fields and no signed values; send it, and its record names the source envelope.

### Templates

- **TMPL-001 — Reusable templates with saved roles.** A template holds documents, fields, roles (for example Client and Company Signer) with routing order, messages, reminders, expiry and identity settings; sending from it asks only for each role's name and email and any sender fields. Several templates can be combined in one envelope (`TMPL-004`). **Acceptance evidence:** create a template with three roles, send it twice to different people, and show each envelope inherited fields, routing, reminders and expiry with no placement.

- **TMPL-002 — Shared team templates.** Templates live in personal or shared folders with an owner, can be shared with people or groups to use or to edit, and are searchable by name and tag. **Acceptance evidence:** a member sees and uses a shared template but cannot edit it; an editor changes it; a member without access cannot find it through the UI or API.

- **TMPL-003 — Template versions that never change sent envelopes.** Editing a template creates a new version; envelopes already sent keep the version they were sent from, and the record names it. A sent envelope can be saved as a new template. **Acceptance evidence:** send from version 1, edit the template, send again; the first envelope still shows version 1 fields and the second version 2; saving the first as a template reproduces its fields and roles.

- **TMPL-004 — Several templates in one envelope.** A sender applies two or more templates to one envelope in a chosen order, alongside any ad hoc documents (`PREP-002`). Recipients whose role name and routing order match across templates merge into one recipient, and a preview shows the merged recipient list before sending. When templates disagree (a role at different orders, different identity methods, reminders or expiry), the preview names the conflict and the sender chooses; without a choice, envelope-level settings follow the first template and identity follows the stricter method. Each template's fields stay on its own documents. The record and certificate name every template and version used. **Acceptance evidence:** an NDA template (role Client, order 1) and a W-9 template (role Client, order 1) go out as one envelope; the client signs both in one session and the certificate lists both template versions; a third template whose Client role sits at order 2 is shown as a separate recipient in the preview before sending; when the W-9 template requires an SMS code and the NDA an email code, the preview names the conflict and proposes the SMS code.

- **TMPL-005 — Template matching on upload.** When a sender uploads a document that matches a template's document (by fingerprint or by page-text similarity), Inkwell offers that template's fields and roles, with the match confidence; the sender applies or ignores the offer, and nothing is placed without their choice. **Acceptance evidence:** upload a fresh copy of the W-9 a template uses; the match is offered and applying it places every template field; an unrelated agreement is offered nothing.

### Recipients and routing

- **ROUTE-001 — Any number of recipients and roles.** An envelope has up to 100 recipients, each with a role: signer, approver (approves without signing), form filler, witness (nominated by the signer they witness, `ROUTE-010`), in-person signer, specify-recipients agent, editor, needs to view (`ROUTE-011`), or receives a copy. Copy recipients receive the completed record and no action link; each recipient sees only their own actions and only the documents visible to them (`ROUTE-012`). **Acceptance evidence:** send to eight signers, one approver, one form filler and three copy recipients, where signer 1 must have a witness; each sees only their own actions; signer 1 nominates a witness who is invited only after signer 1 signs and before order 2; copy recipients receive only the completed record.

- **ROUTE-002 — Sequential, parallel and mixed order.** Recipients share or differ in routing order: equal numbers act in parallel, higher numbers wait for all lower ones to finish. **Acceptance evidence:** recipients at orders 1, 2, 2 and 3; both order-2 recipients are invited together after order 1, and order 3 is invited only after both finish.

- **ROUTE-003 — Conditional routing.** A routing rule includes or skips a recipient based on a field value (for example, amounts over 10,000 USD add the finance director). Skipped recipients are recorded with the rule that skipped them. **Acceptance evidence:** two envelopes from one template with amounts of 5,000 and 25,000 USD; only the second routes to the finance director, and the first's certificate names the skipped step and its rule.

- **ROUTE-004 — Internal approval before sending.** A template or account rule can require a named approver to approve an envelope before it goes to external recipients, with approve and reject (with reason) actions and an audit entry for each. **Acceptance evidence:** a sender's envelope above the rule's threshold waits for the approver; a rejection returns it to the sender with the reason; an approval sends it.

- **ROUTE-005 — Signing groups.** A recipient can be a signing group; any one member signs for it, and the record names who did. **Acceptance evidence:** send to the "Company Signers" group of three; one member signs, the others' links show it is done, and the certificate names the signer and the group.

- **ROUTE-006 — Delegation and reassignment.** When the sender allows it, a recipient reassigns their action to someone else with a reason; the sender can also replace an unsigned recipient. The original recipient's link stops working and the record shows both people. **Acceptance evidence:** a signer reassigns to a colleague; the colleague verifies and signs; the original link refuses; a disallowed reassignment is refused.

- **ROUTE-007 — Hosted in-person signing.** A team member hosts an in-person signer on their own device or a tablet; the signer's identity is attested by the host, and the record names both. The host's session cannot read other envelopes from the signing screen. **Acceptance evidence:** an admin hosts an in-person signer at 768 pixels, the signer signs, and the certificate records the host, the attestation and the device.

- **ROUTE-008 — Contacts and recent recipients.** Senders pick recipients from a shared contact book and recent recipients, with name, email, phone and company; contacts can be imported from CSV and synced from the CRM. **Acceptance evidence:** import 200 contacts from CSV, autocomplete a recipient by company, and show a CRM-fake contact appears after sync.

- **ROUTE-009 — Sign it yourself.** A signed-in member signs their own document with nobody else involved: they upload it (or pick it from a connected store or mailbox add-in, `INTEG-004`, `INTEG-005`), place their own fields, and sign in the app with no invitation and no mailbox code, because their signed-in session (and its sign-in method: password, passkey or SSO) is the authentication, which the certificate records. They then download the executed PDF and certificate, file them, and optionally send the completed copy to other people. A member's adopted signature and initials are saved to their profile and reused for later self-signing and in-app signing (`MANAGE-003`) until they change them. When the sender is also a recipient at the first routing order of their own envelope, they sign in the app immediately after approving it, with no email to themselves, and only then is the next order invited. **Acceptance evidence:** a member self-signs a three-page PDF and the mail fake records no message; the certificate names session authentication and the sign-in method; the member downloads the executed PDF and certificate and sends the completed copy to two addresses; a second self-signed document reuses the saved signature without adopting it again; on another envelope the sender at order 1 signs in the app right after approval, and the order-2 signer is invited only after that signature.

- **ROUTE-010 — Witnesses nominated by their signer.** The sender requires or allows up to two witnesses for a signer. The signer nominates each witness by name and email while signing (or the sender names them in advance), and a witness cannot be the signer or another recipient of the envelope. A witness is invited only after their signer signs and before any later routing order proceeds, authenticates with the method the sender set (`IDV-001`), sees only the documents their signer signed with that signer's completed signature and their own witness fields (signature, printed name, date and, when set, address), and signs. If a witness declines, the step returns to the signer to nominate someone else. The certificate links each witness to the signer they witnessed, with both parties' authentication evidence. **Acceptance evidence:** signer 1 nominates a witness while signing; the witness is invited only after signer 1 signs and order 2 waits for the witness; the witness verifies, sees only signer 1's document and their own fields, not a document visible only to signer 2, and signs; the certificate names the witness against signer 1; nominating the signer's own email as witness is refused; a declining witness returns the step to signer 1, who nominates another.

- **ROUTE-011 — Recipients who name, edit or only view.** Besides signers and approvers, a recipient can be a specify-recipients agent, who enters the names and emails of later recipients the sender left open; an editor, who may change later recipients, their fields and the messages before passing the envelope on, with every change audited; needs to view, who must open the documents before routing continues; or certified delivery, who must open them and whose opening is recorded as proof of delivery. **Acceptance evidence:** an agent at order 1 names the order-3 signer, who is then invited; an editor at order 2 adds a field and changes a later recipient's email, and the audit trail shows both; a needs-to-view recipient blocks order 3 until they open the documents; a certified-delivery recipient's view time is on the certificate.

- **ROUTE-012 — Document visibility per recipient.** In a multi-document envelope the sender chooses which documents each recipient may see; by default a recipient sees every document, and an account policy can hide documents in which a recipient has no fields. Hidden documents are absent from that recipient's signing view, downloads, completed copy, embedded view and API recipient view, and the certificate states which documents each recipient was shown. **Acceptance evidence:** an envelope with an offer letter and a compensation memo for the hiring manager: the candidate never sees the memo while signing, in downloads, in their completed copy or through the API recipient view; the manager sees and signs both; the certificate lists each recipient's visible documents.

### Signer experience

- **SIGNX-001 — Guided mobile-first signing.** Signing works on a phone at 360 pixels without zooming: a Start and Next button walks the signer through every required field, a progress count shows what remains, the document pages render sharply and load progressively, and the signer can finish later from the same link. **Acceptance evidence:** a signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes; the journey records time to first page under 3 seconds on a throttled mobile profile.

- **SIGNX-002 — Draw, type or upload signatures and initials.** The signer adopts a signature and initials by typing (choice of styles), drawing with finger or mouse, or uploading an image; the adopted marks are applied to every signature and initials field, and the record keeps the adoption method. A signed-in member's adopted marks are saved and reused (`ROUTE-009`). **Acceptance evidence:** one signer draws on a touch screen, another types and a third uploads; all three appear in the executed PDF and the certificate records each method.

- **SIGNX-003 — Accessible signing.** Signing and preparation meet WCAG 2.2 AA: keyboard-only completion, screen-reader labels for every field and its state, visible focus, 200% zoom without loss, and sufficient contrast in both themes. **Acceptance evidence:** an automated accessibility scan with no serious violations on the signing and preparation pages, plus a keyboard-only and a screen-reader journey that complete an envelope.

- **SIGNX-004 — Decline with reason.** A signer declines with a required reason; the envelope stops, the sender and earlier signers are notified, and the reason is in the record. **Acceptance evidence:** the second signer declines; the third is never invited, the sender receives a notice with the reason, and the certificate records the decline.

- **SIGNX-005 — ESIGN and UETA consumer disclosure.** Before first signing, a signer reviews the account's electronic record and signature disclosure (how to withdraw consent, request a paper copy, update contact details and the hardware and software needed) and agrees to it; the disclosure version and agreement time are in the record. A signer can withdraw consent, which stops the envelope and notifies the sender. **Acceptance evidence:** a new signer sees and accepts the disclosure; a second signer withdraws consent and the envelope stops with the withdrawal recorded; the certificate quotes the disclosure version.

- **SIGNX-006 — Branded sending and signing.** An account brand sets logo, colours, sender display name, reply-to address, email footer and a custom sending domain; brands can differ per template. **Acceptance evidence:** two brands on two templates; invitations and signing pages show each brand's logo and colours, and email headers use its reply-to and domain.

- **SIGNX-007 — English and Spanish signing.** Signing pages, emails, disclosures and the certificate are available in English and Spanish, chosen per recipient or by the signer. **Acceptance evidence:** a recipient set to Spanish receives a Spanish invitation, signs on Spanish pages and receives a Spanish completion email; the certificate shows the language used.

- **SIGNX-008 — Signer document actions and paper signing.** Before and after signing, a signer can download and print the documents visible to them (`ROUTE-012`). When the sender allows it, a signer can choose to sign on paper instead: they download the documents, sign them by hand, and upload a scan or phone photo; the sender reviews and accepts or rejects the upload, and the record marks that recipient's signature as wet ink with the uploaded pages' fingerprint, which the certificate states. **Acceptance evidence:** a signer downloads and prints the document before signing; on an envelope that allows paper signing, a signer uploads a three-page scan, the sender accepts it and the certificate marks the signature as wet ink with the scan's fingerprint; when paper signing is not allowed, the option is absent and the API refuses the upload.

- **SIGNX-009 — Recipient comments and supplemental documents.** Recipients and the sender exchange comments on a document while it is out for signature, threaded and anchored to a page, visible to the parties the author chooses and kept in the record. The sender attaches supplemental documents (terms, policies, a handbook) that recipients must view or acknowledge but do not sign; each acknowledgement is recorded. **Acceptance evidence:** a signer comments on page 2, the sender replies, and the next signer sees the thread when it was shared with them; a supplemental handbook must be acknowledged before the signer can finish, and the certificate lists the acknowledgement and its time.

### Signer identity

- **IDV-001 — Per-recipient authentication choice.** For each recipient the sender chooses none (link only), email code, access code, SMS code or identity verification, with account defaults and template settings; the certificate records the method and outcome. **Acceptance evidence:** one envelope with four recipients using four different methods; each must pass their own method, and the certificate lists each method and result.

- **IDV-002 — SMS one-time codes.** A recipient verifies with a code sent by SMS to a US mobile number through the buyer's Twilio account or Inkwell's registered sender, with resend spacing, expiry and attempt limits matching email codes. **Acceptance evidence:** through an SMS provider fake, a recipient receives and enters a code, a wrong code and an expired code are refused, and the certificate records the masked number.

- **IDV-003 — Access codes.** The sender sets an access code shared out of band; the recipient must enter it before seeing the document, with attempt limits. **Acceptance evidence:** a recipient is refused with a wrong code, locked after five attempts, and admitted with the right one.

- **IDV-004 — Identity document verification through a provider.** A recipient verifies a government photo ID and a selfie through Persona or Stripe Identity before signing; Inkwell stores only the provider's verification reference, result and name match, never the ID images. **Acceptance evidence:** through a provider fake, a matching verification admits the signer, a failed one refuses with a retry, and the record holds only the reference and outcome.

- **IDV-005 — Knowledge-based and phone authentication.** For US recipients the sender can require knowledge-based authentication (questions from public and credit records through an identity provider such as LexisNexis Risk Solutions) or phone authentication (a code delivered by voice call or SMS through Twilio to a number the sender sets). Attempts are limited, a failed recipient is locked with a notice to the sender, and Inkwell stores only the provider's reference and pass or fail, never the questions or answers. **Acceptance evidence:** through provider fakes, a recipient who passes the questions is admitted, one who fails twice is locked and the sender notified; a voice-call code admits a second recipient; the record holds only the references and outcomes.

### Delivery and follow-up

- **DELIV-001 — Live delivery with per-message status.** Invitations, codes and notices go out through the configured provider (Cloudflare Email, Amazon SES, Postmark, SendGrid or SMTP) and each message shows queued, sent, delivered, opened, bounced or failed from provider events. Uncertain provider responses are never blindly retried. **Acceptance evidence:** through a mail provider fake, a sent invitation moves to delivered and opened from provider webhooks, and an uncertain send is shown as uncertain with no duplicate.

- **DELIV-002 — Bounces and bad addresses.** A hard bounce or rejected address flags the recipient, pauses their reminders and alerts the sender, who corrects the address and resends in one step. **Acceptance evidence:** a bounce event marks the recipient, the sender is alerted, corrects the email and the corrected recipient signs.

- **DELIV-003 — Automatic reminders.** Reminders start N days after a recipient's invitation and repeat every M days, only to recipients whose action is current, within the account's US time zone and business days, and stop at signature, decline, void or expiry. Account, template and envelope levels set them. **Acceptance evidence:** with the clock advanced, a current signer receives reminders on days 2, 4 and 6 skipping a weekend, a waiting signer receives none, and reminders stop after the signature.

- **DELIV-004 — Configurable expiry with warnings.** Expiry is set per envelope, template or account (default 120 days), recipients and the sender are warned before it, and the sender can extend it before or after expiry without re-preparing. **Acceptance evidence:** an envelope set to expire in 10 days warns on day 7, the sender extends it by 14 days, and the signer signs on day 12.

- **DELIV-005 — Resend by email or SMS.** The sender resends the current invitation by email or SMS; the old link keeps working unless the sender rotates it. **Acceptance evidence:** resend by SMS through the provider fake, the signer opens the SMS link and signs; after rotation the old link refuses.

- **DELIV-006 — Correct an envelope in flight.** Before a recipient acts, the sender changes their name, email or phone, adds or removes later recipients, edits the messages or expiry, without invalidating signatures already given; corrections are audited and old links stop working. **Acceptance evidence:** after signer 1 signs, correct signer 2's email and add a copy recipient; signer 1's signature stands, the old link for signer 2 refuses, and the new one completes the envelope.

- **DELIV-007 — Completed copies to every party.** On completion, every recipient and copy recipient receives the executed documents and certificate as an attachment or a secure link (account setting; attachments above 10 MB become links), and the sender's account files them. **Acceptance evidence:** complete an envelope with two signers and a copy recipient; all three receive the completed copy through the mail fake, and secure links require their mailbox code.

- **DELIV-008 — Sender notifications.** Senders get viewed, signed, declined, completed, bounced and expiring notices by email, in an in-app activity feed and, when connected, in Slack, Microsoft Teams or Nook; each person chooses which they receive. **Acceptance evidence:** a sender subscribed to declines and completions in Slack and email receives each from the respective fakes and nothing else.

### Bulk send and web forms

- **BULK-001 — Bulk send from a spreadsheet.** From a template, a sender uploads a CSV or XLSX of up to 1,000 rows (one envelope per row, with role names, emails and prefill values); a preview validates every row before anything is sent; the batch shows per-row status, and the sender can resend, correct or void remaining rows. **Acceptance evidence:** upload 500 rows with three invalid emails; the preview marks the three, the sender sends the rest, and the batch shows each envelope's status as they complete.

- **FORM-001 — Public signing web forms.** A template becomes a web form with a link, QR code and embed snippet; the signer enters their own name and email, verifies the email, signs, and the envelope can route to a company countersigner. Forms have submission limits, expiry and Turnstile bot protection, and every submission is an envelope in the dashboard. **Acceptance evidence:** open a form link signed out, verify an email and sign; the company signer countersigns; a bot request without a Turnstile token and a submission past the limit are refused.

### Envelope management and reporting

- **MANAGE-001 — Envelope dashboard with search.** Senders see drafts, waiting for me, waiting for others, completed, declined, voided and expired envelopes, search by title, recipient, email and custom field, filter by date, sender, template and status, and page through thousands. **Acceptance evidence:** with 5,000 envelopes, search by recipient email returns in under one second and each status filter shows the right count.

- **MANAGE-002 — Folders, tags and custom envelope fields.** Envelopes go into shared folders, carry tags and custom fields (for example deal ID or cost center) that are searchable, reportable and sent to integrations. **Acceptance evidence:** a template adds a required cost-center field; envelopes are filtered and exported by it and the HubSpot fake receives it.

- **MANAGE-003 — Waiting for me.** Team members who must sign or approve envelopes from colleagues see them in a waiting-for-me list and sign inside the app without an email round trip. **Acceptance evidence:** an admin is the second signer of a colleague's envelope and signs from the in-app list after the first signer finishes.

- **MANAGE-004 — Reports and exports.** Reports show envelopes sent, completed, declined and expired, time to complete, and per sender and per template turnaround over a date range, with CSV export. **Acceptance evidence:** a fixture of 300 envelopes produces the expected counts and median turnaround, and the CSV matches the report.

- **MANAGE-005 — Envelope detail and timeline.** Each envelope has a detail page showing its documents, every recipient's place in routing and timeline (sent, delivered, viewed, authenticated, signed, declined or bounced, with times in the account's US time zone and UTC), what each recipient is waiting on, and the actions available to the viewer (remind, resend, correct, void, copy, download), next to the audit trail. **Acceptance evidence:** for an envelope with three recipients mid-routing, the detail page at 1440 and 390 pixels shows each recipient's sent, delivered, viewed and signed times matching the provider events (`DELIV-001`) and the audit trail, and its remind action sends one reminder to the current signer only.

### Execution evidence

- **RECORD-002 — Per-recipient certificate evidence.** The certificate of completion lists for every recipient their authentication method and result, IP address, user agent, adopted signature and method, disclosure acceptance, and every timestamp in UTC and the account's US time zone, plus every document's fingerprint. **Acceptance evidence:** complete an envelope with email-code and SMS-code signers and show each item on the certificate matches the audit trail.

- **RECORD-003 — Sealed PDFs.** The executed PDF carries a PDF digital signature (PAdES) from the installation's signing certificate or a certificate on the Adobe Approved Trust List obtained through a provider, so Adobe Acrobat shows the document as unmodified and any change breaks the seal. **Acceptance evidence:** open the executed PDF in a PDF validator to show a valid seal; modify one byte and show the seal fails.

- **RECORD-004 — Public verification.** Anyone with an executed PDF or certificate uploads it to the installation's verification page and learns whether it matches a completed envelope, without signing in and without revealing other envelopes. **Acceptance evidence:** a signed-out visitor verifies a genuine executed PDF, an altered copy fails, and an unrelated PDF reveals nothing.

- **RECORD-005 — Retention and legal hold.** Account and folder rules purge completed envelopes after a set number of years with notice to admins, and a legal hold stops purge and erasure for named envelopes. **Acceptance evidence:** with the clock advanced, a seven-year rule purges an envelope after its warning, and a held envelope survives both the rule and an erase request.

### Team administration

- **ADMIN-001 — Roles and envelope sharing.** Roles are owner, admin, sender and viewer; senders see their own envelopes and those shared with them or their groups, admins see all, viewers only read. Envelopes and folders can be shared with people and groups. **Acceptance evidence:** two senders cannot see each other's envelopes until one shares a folder; a viewer can read but not send; the API enforces the same boundaries.

- **ADMIN-002 — Members, groups and departures.** Admins invite, deactivate and re-role members, manage groups, and transfer a departing member's envelopes and templates to someone else without breaking in-flight signing. **Acceptance evidence:** deactivate a sender with two in-flight envelopes; transfer them; both complete and notify the new owner.

- **ADMIN-003 — SSO and SCIM.** Members sign in through SAML or OIDC single sign-on (Okta, Microsoft Entra ID, Google Workspace, Auth) and are provisioned and deprovisioned through SCIM 2.0; SSO can be required for everyone but the owner's recovery path. **Acceptance evidence:** through IdP fakes, an OIDC and a SAML sign-in succeed, a SCIM create adds a member and a SCIM deactivate ends their sessions.

- **ADMIN-004 — Account defaults and sending policies.** Admins set default reminders, expiry, authentication methods, allowed signature adoption methods, branding, retention, the consumer disclosure and sending policies (for example templates only, or approval before external sending). **Acceptance evidence:** change each default and show new envelopes inherit it; a templates-only policy refuses an ad hoc upload by a sender.

- **ADMIN-005 — Account audit log.** Every change to members, roles, groups, settings, templates, brands, integrations and API keys is recorded with actor, time and before and after values, searchable and exportable to CSV. **Acceptance evidence:** change a template, a role and an integration; the log shows all three with before and after values and exports them.

- **ADMIN-006 — Transparent usage and cost.** There are no envelope quotas or seat fees from Inkwell; the account shows envelopes sent and provider usage that costs the buyer money (SMS, identity checks, storage, AI) in USD with optional monthly caps that warn and then stop the paid feature. **Acceptance evidence:** with an SMS cap of 5 USD, sending past the cap warns, then stops SMS codes while email codes continue, and the usage page shows the totals.

- **ADMIN-007 — First-day setup and readiness.** On the buyer's own Cloudflare account, the owner claims the installation and a setup checklist covers the app domain, the sending domain's SPF, DKIM and DMARC records (checked live, showing any record to add), the mail and SMS provider connections with a test message, the identity, payment and AI provider checks the account uses, the brand (`SIGNX-006`) and the consumer disclosure (`SIGNX-005`). A readiness screen shows every check as passing or failing, and the first real send is refused until mail is ready, unless the owner records an explicit override. **Acceptance evidence:** in a fresh installation the owner claims it; with a DNS fake missing the DKIM record, the readiness screen shows DKIM failing with the exact record to add and a real send is refused; after the record is added the check passes and the send goes.

### Developer platform

- **API-001 — Public REST API.** A documented OpenAPI REST API with scoped API keys and OAuth 2.0 lets an application create envelopes from templates or files, set recipients, fields and prefill, send, read status, download artifacts, correct, resend, void and list, with idempotency keys and rate limits. **Acceptance evidence:** a client creates, sends, polls, downloads and voids envelopes using only the published OpenAPI document; a repeated idempotency key returns the first result; a key without the send scope is refused.

- **API-002 — Signed webhooks with retries.** Webhooks report sent, delivered, viewed, signed, declined, completed, voided, expired, bounced and reminder events, signed with HMAC SHA-256, retried with backoff for 72 hours, logged with every attempt, and replayable; each event has an ID so receivers can deduplicate. **Acceptance evidence:** a receiver fake fails twice then succeeds; the log shows three attempts; a replay delivers the same event ID; a tampered signature is rejected by the documented verification.

- **API-003 — Embedded signing and sending.** An application embeds signing (a recipient view URL or web component in an iframe, with postMessage events for signed, declined and closed) and embedded preparing and sending in its own pages, restricted to allowed origins. **Acceptance evidence:** a test page on an allowed origin embeds signing and receives the signed event; an unlisted origin is refused; embedded preparing creates and sends an envelope.

- **API-004 — SDKs and test mode.** JavaScript/TypeScript and Python SDKs cover the API, and a test mode creates watermarked, non-binding envelopes that never count toward usage or reach production integrations. **Acceptance evidence:** the SDK examples run against a test-mode key; test envelopes are watermarked and absent from production reports and webhooks.

### Integrations

- **INTEG-001 — HubSpot.** Send from a HubSpot deal or contact with prefilled templates; status, key fields and the completed PDF return to the record and its timeline. **Acceptance evidence:** through a HubSpot fake, send from a deal, complete it and show the deal's properties, timeline event and attached PDF updated once.

- **INTEG-002 — Salesforce.** Send from a Salesforce Opportunity, Account or Contact with merge fields; status and fields write back and the completed PDF attaches to the record's Files. **Acceptance evidence:** through a Salesforce fake, send from an Opportunity, complete it and show field write-back and the attached file.

- **INTEG-003 — Orbit.** The same send, prefill and write-back for Orbit deals and contacts through Orbit's API. **Acceptance evidence:** through Orbit's API in a test installation, send from a deal and show the completed record on it.

- **INTEG-004 — Google Workspace.** Pick sources from Google Drive and Google Docs (a Google Doc is exported to PDF and converted and fingerprinted as in `PREP-001`), file completed envelopes to a chosen Drive folder per template, and use the Gmail add-on: from an open message with an attachment, see the attachment and the message's participants (sender, To and Cc) proposed as recipients, then send it for signature or sign it yourself (`ROUTE-009`). **Acceptance evidence:** through a Google fake, send a Drive document and show the completed PDF and certificate in the configured folder; pick a Google Doc and show it arrives as a converted PDF whose fingerprint the envelope binds; in the Gmail add-on test harness, open a message with a PDF attachment from a client with one person on Cc, see the attachment and both participants proposed as recipients, and send; from another message, sign the attached PDF yourself with no mail sent to you.

- **INTEG-005 — Microsoft 365.** Pick sources from OneDrive and SharePoint and file completed envelopes there; use the Outlook add-in, which from an open message with an attachment shows the attachment and the message's participants (sender, To and Cc) proposed as recipients, then sends it for signature or lets you sign it yourself (`ROUTE-009`); and use the Word add-in, which sends the open document (converted as in `PREP-001`) for signature. **Acceptance evidence:** through a Microsoft Graph fake, send a OneDrive document and show the completed record filed in the SharePoint folder; in the Outlook add-in test harness, open a message with a PDF attachment and two participants, see the attachment and both participants proposed as recipients, and send; sign another message's attachment yourself with no mail sent to you; in the Word add-in test harness, send the open document and show the envelope binds the converted PDF's fingerprint.

- **INTEG-006 — Box and Dropbox.** File completed envelopes automatically to a Box or Dropbox folder per template. **Acceptance evidence:** through Box and Dropbox fakes, a completion files the PDF and certificate once each, and a retry does not duplicate.

- **INTEG-007 — Chest.** Pick sources from Chest and file completed envelopes to a Chest folder. **Acceptance evidence:** in a test installation of Chest, a completion appears in the configured Chest folder with its fingerprint.

- **INTEG-008 — Locket handoff.** Locket starts signature for an approved contract revision, and the completed record (documents, certificate, parties, signing dates and fingerprints) is delivered to Locket's repository, which records it against that revision. **Acceptance evidence:** a Locket-initiated envelope completes and Locket shows the executed record against the approved revision; a downloaded handoff manifest still verifies offline.

- **INTEG-009 — Zapier, Make, Power Automate, n8n and Crank.** Published apps expose triggers (envelope sent, completed, declined, voided) and actions (send from template, find envelope, download), built on the API and webhooks. **Acceptance evidence:** each app's test harness triggers on a completion and sends from a template.

- **INTEG-010 — Payment at signing through Stripe.** A template can require a payment, deposit or saved card or ACH mandate when the signer signs, collected through the buyer's Stripe account (Payment Element or Checkout); the envelope completes only after Stripe confirms, and Inkwell keeps only Stripe's references and outcome. **Acceptance evidence:** in Stripe test mode, a signer pays a 500 USD deposit and the envelope completes with the payment reference; a declined card leaves the envelope waiting with the signature unsaved.

- **INTEG-011 — Signing service for sibling products.** Platter, Lodge, Willow, Terrace and other Run Edit Run products send their documents through Inkwell's API and receive the completed record through webhooks, each with its own scoped key. **Acceptance evidence:** a Lodge-style client sends an offer letter from a template and receives the completion webhook and executed PDF.

### Mobile

- **MOBILE-001 — Responsive sending and tracking.** Senders send from templates, track status, remind, correct and void from a phone browser at 390 pixels, with the app installable as a PWA. **Acceptance evidence:** at 390 pixels, send from a template, remind a signer and void an envelope.

- **MOBILE-002 — Native iOS and Android apps.** Native apps sign, send from templates, track and remind, receive push notifications, and scan paper pages with the camera into a PDF to send. **Acceptance evidence:** on iOS and Android simulators, sign a received envelope with a drawn signature using guided Next; send from a template, track its recipients and send a reminder; scan a two-page document and send it; and receive a push notification on each signature and on completion.

### Migration and portability

- **MOVE-002 — Docusign move-in.** Through the Docusign eSignature REST API with the buyer's OAuth grant, Inkwell imports completed, declined and voided envelopes with their documents, certificates of completion, recipients and custom fields; templates with roles, fields, routing and their shared folders; signing groups with their members (`ROUTE-005`); and the account's address book (`ROUTE-008`). Ownership carries over: Docusign users are matched to Inkwell members by email, each imported envelope belongs to its original sender and stays private to them under `ADMIN-001` (and shared as it was in Docusign), each template keeps its owner, and each shared folder keeps its people, groups and use or edit permissions (`TMPL-002`). Users with no matching member go on the unmapped list and their items go to an admin the owner names, who can reassign them later (`ADMIN-002`). The import previews first, with counts per sender, and lists what did not map; it runs throttled and resumable at real account size (`MOVE-008`). **Acceptance evidence:** through a Docusign API fake with two senders, 50 envelopes, five templates in a shared folder, two signing groups and 120 contacts, preview and import; each sender sees only their own imported envelopes in the UI and API while an admin sees all; the shared folder's settings carry over, so a member with use access can send from a template but not edit it; an imported signing group sends as one recipient; contacts autocomplete; a third Docusign user with no member is on the unmapped list and their envelopes belong to the named admin; open an imported certificate and send from an imported template; the unmapped list names each skipped field type.

- **MOVE-003 — Adobe Acrobat Sign move-in.** Agreements with their audit reports and library templates import through the Acrobat Sign API with the same preview, unmapped list, ownership mapping by email as `MOVE-002`, and the throttled, resumable job of `MOVE-008`. **Acceptance evidence:** through an Acrobat Sign API fake with two senders, import agreements and a library template, show each sender owns only their own agreements, and send from the template.

- **MOVE-004 — Dropbox Sign move-in.** Signature requests with their files and audit trails and templates import through the Dropbox Sign API, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`. **Acceptance evidence:** through a Dropbox Sign API fake with two senders, import requests and templates, show each sender owns only their own requests, and send from one.

- **MOVE-005 — Documenso move-in.** Documents with their audit logs and templates import from Documenso's API or export, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`. **Acceptance evidence:** through a Documenso fake with two senders, import documents and a template, show each sender owns only their own documents, and send from it.

- **MOVE-006 — Cutover of in-flight envelopes.** Envelopes still waiting in the incumbent at cutover are listed under their mapped sender and tracked read-only until they complete there, then imported automatically; nothing is re-sent to signers. Tracking uses the incumbent's completion webhooks (Docusign Connect) where the grant allows and otherwise polls no more often than the incumbent permits (`MOVE-008`). **Acceptance evidence:** a fake with two in-flight envelopes; one completes after cutover and is imported under its sender, the other is voided upstream and is listed as voided; the fake's call log shows neither envelope polled twice within 15 minutes.

- **MOVE-007 — API compatibility for common calls.** A compatibility layer accepts the most common Docusign and Dropbox Sign API calls (create from template, send, status, download, void, completion webhooks) so an existing integration switches by changing its base URL and key. **Acceptance evidence:** a client written against the incumbent's documented requests runs unchanged against the compatibility layer for create, send, status, download and void.

- **MOVE-008 — Throttled, resumable imports at account size.** Every API import (`MOVE-002` to `MOVE-006`) runs as a background job sized for real accounts (tens of thousands of envelopes over many years). It stays under the incumbent's published limits, reading the limit headers (for Docusign, the account's hourly limit, 3,000 calls by default, and the burst limit, and never polling one resource more than once every 15 minutes); on a rate-limit response (`HOURLY_APIINVOCATION_LIMIT_EXCEEDED`, HTTP 429) it pauses until the window resets. It checkpoints after every batch, so an interruption, a restart or an expired grant resumes from the last checkpoint, and it is idempotent on the incumbent's envelope and template IDs, so a resumed or repeated import creates no duplicate. The job shows progress, an estimated finish time, counts per state and the unmapped list, and the owner can pause or cancel it. **Acceptance evidence:** a Docusign fake with 18,000 envelopes and a 3,000-call hourly limit, with the clock advanced: the import returns the hourly-limit error mid-import, pauses, resumes after the window and finishes; the job is killed mid-batch and resumed, and exactly 18,000 envelopes exist with no duplicates; the fake's call log shows no hour over the limit and no resource polled twice within 15 minutes.

- **PORT-002 — Self-service export at any size.** Admins export all or selected envelopes as PDFs, certificates, audit JSON and a CSV index, streamed in chunks without the 24 MiB browser limit, and a whole-installation archive restores at that size. **Acceptance evidence:** export 2 GB of envelopes, interrupt and resume, and restore into an empty installation with every fingerprint verified.

### Compliance profiles

- **COMPLY-001 — 21 CFR Part 11 signing profile.** An optional profile for life-science buyers requires re-authentication at each signature, a signing reason, the signature manifestation (printed name, date and meaning) on the document, and a validation package: installation, operational and performance qualification (IQ, OQ and PQ) scripts with their executed results for the installed version, a traceability matrix from each Part 11 requirement (11.10, 11.50, 11.70, 11.100, 11.200 and 11.300) to the feature and test that meets it, and the change log since the last validated version. **Acceptance evidence:** with the profile on, a signer re-authenticates and picks a reason; the executed PDF shows the manifestation; the validation package for the installed version contains IQ, OQ and PQ scripts with executed results, and every traceability-matrix row cites a test that passed in that run.

- **COMPLY-002 — HIPAA-ready installation.** Healthcare buyers can run Inkwell with logging that excludes document content, access reviews, and a documented shared-responsibility guide for their Cloudflare account; a business associate agreement is the buyer's arrangement with their providers. **Acceptance evidence:** in the profile, logs contain no field values or document text after a full signing journey, and the access review report lists every member's last access.

## Push further

Agents carry the agreement from request to filed record. Each clause says what the agent does, on which data, and under what human control. Agents act through the same API and authority checks as people (`ACCESS-001`, `DELEGATE-001`), every action is in the audit trail with the agent named, and no agent agrees to terms, signs, sends or spends money without the grant the clause names.

### Agents that carry the agreement

- **AGENT-001 — Assemble the envelope from CRM and email context.** *What the agent does:* from a request ("send the MSA to Acme") or a deal stage change, picks the approved template, fills roles and fields from the CRM record and the email thread with the customer, and proposes signers with their authority (title, entity). *Data:* the CRM record (Orbit, HubSpot, Salesforce), the granted mailbox thread (Gmail, Outlook), templates and contacts. *Human control:* the sender sees a draft envelope with each value's source and confidence and approves sending; the agent cannot send, and a value it could not source stays empty. **Acceptance evidence:** from a CRM-fake deal and email-fake thread, the agent drafts an envelope whose prefilled values each cite their source; the sender edits one and sends; a request with no matching template is refused with a reason.

- **AGENT-002 — Fill what is missing.** *What the agent does:* before sending, detects missing parties, fields, attachments and inconsistencies (an entity name that differs from the CRM, a missing signer title, a W-9 not attached) and asks the right person (sender, colleague or recipient) by email with one specific question, then merges the answer with its provenance. *Data:* the draft envelope, CRM record and replies. *Human control:* the sender approves who may be asked; changes to material terms are flagged for the sender and never applied by the agent. **Acceptance evidence:** a draft missing the client signer's title and the W-9; the agent asks the right people, merges both answers with sources, and flags a reply that changes the price instead of applying it.

- **AGENT-003 — Chase stalled signers under the sender's rules.** *What the agent does:* watches each recipient's events (not opened, opened and left, bounced, out-of-office replies, repeated views), tells apart an unavailable signer, a bad address and a substantive objection, and follows up by allowed channels and times with a message suited to the cause; an objection goes to the sender (or Locket) instead of another reminder. *Data:* delivery and signing events, replies in the granted mailbox, the CRM owner. *Human control:* the sender sets channels, maximum contacts, quiet hours and the escalation owner; the agent never negotiates or changes the document. **Acceptance evidence:** three stalled signers (bounce, out-of-office until Monday, reply objecting to a clause); the agent proposes a corrected address, waits until Monday, and routes the objection to the sender, staying within the contact limit.

- **AGENT-004 — Verify the intended revision and parties.** *What the agent does:* before sending and at completion, compares the documents against the approved revision (Locket's approved version or the template version) page by page, checks every required party signed in the right capacity for the right entity, and checks every required field is complete and plausible. *Data:* the envelope's fingerprints and documents, the approved revision, CRM signatory data. *Human control:* a mismatch raises an exception the sender must resolve; the agent cannot alter a completed record. **Acceptance evidence:** an envelope whose second page differs from the Locket-approved revision is stopped before sending with the differing text; a completed envelope signed by a person without signing authority raises an exception and the downstream handoff waits.

- **AGENT-005 — Complete the downstream work.** *What the agent does:* after a verified completion, moves the CRM deal stage, files the record to Locket and the file store, and creates the next task (customer onboarding, invoice draft in Nectar or Pantry, HR onboarding in Willow), each once, with a receipt per effect. *Data:* the completed record and the standing grants. *Human control:* standing grants name the systems, fields and task types; the agent never creates a charge or binds a contract; failed effects stay open and visible. **Acceptance evidence:** a completion produces one deal update, one filed record and one onboarding task through fakes; a replayed webhook creates nothing new; a refused grant leaves its effect open with the reason.

- **AGENT-006 — Keep integrations correct.** *What the agent does:* reconciles webhook deliveries and connector state against Inkwell's records, detects drift (a renamed CRM field, a moved folder, an expired token), proposes the mapping repair and proves a replay causes no duplicate. *Data:* webhook logs, connector configurations and the remote API state under grant. *Human control:* the owner approves scope changes and repairs; uncertain remote effects stay unresolved until confirmed. **Acceptance evidence:** rename a CRM field in the fake; the agent detects failed write-backs, proposes the new mapping, and after approval replays them without duplicates.

- **AGENT-007 — Keep templates current.** *What the agent does:* learns from senders' repeated corrections (fields always added, recipients always changed) and outside changes (a new IRS W-9 revision, a new company address) and proposes a template revision with its reasons. *Data:* envelopes sent from the template and their corrections. *Human control:* the template owner reviews the diff and publishes a new version (`TMPL-003`); nothing changes without them. **Acceptance evidence:** ten envelopes where senders added the same field; the agent proposes adding it with the ten examples cited; the owner accepts and version 2 is published.

- **AGENT-008 — Signer assistant.** *What the agent does:* answers a signer's questions about what they are being asked to fill and sign, citing the page and passage, and explains each field in plain English or Spanish. *Data:* only the envelope's documents visible to that signer. *Human control:* the assistant gives no legal advice, cannot fill or sign, and a signer's questions are private unless they choose to send them to the sender. **Acceptance evidence:** a signer asks what the termination notice period is and receives the answer with its page cited; a request to sign for them is refused; the sender sees no question unless the signer sends it.

- **AGENT-009 — Inbound agreements.** *What the agent does:* reads agreements forwarded to the account's Inkwell address or arriving from other platforms for the business to sign, identifies who internally should sign, prepares the internal signing and tracks the counterparty's request. *Data:* the forwarded email and attachments. *Human control:* the named internal signer approves and signs; the agent never signs and never replies to the counterparty without the owner's grant. **Acceptance evidence:** forward a vendor NDA; the agent identifies the internal signer by role, prepares it for them, and after they sign returns the executed copy only when the grant allows.

## Honest boundaries

- **Notarization and qualified signatures.** Inkwell does not act as a notary, a remote online notarization platform or an EU/UK qualified trust service. Buyers who need notarized signatures use a partner such as Proof (Notarize) through an integration, and qualified electronic signatures through a qualified trust service provider. Inkwell's records state the signing profile used and never claim those assurances.
- **Identity verification.** Inkwell orchestrates identity checks (`IDV-004`) through Persona or Stripe Identity and keeps only their references; it does not verify ID documents itself.
- **Payments.** Inkwell never handles card or bank data and holds no balances; Stripe processes payments at signing (`INTEG-010`) and recurring billing starts in Nectar or the buyer's billing system.
- **Legal validity.** Inkwell provides ESIGN and UETA consent, disclosure and audit records and states what its certificate and seal prove; it does not give legal advice or guarantee that any agreement is valid. Exceptional agreements (wills, certain family-law and court documents, some real-estate filings) go to counsel or specialist services.
- **Contract lifecycle.** Drafting, negotiation, clause libraries, the contract repository and renewal and obligation tracking belong to Locket (or Ironclad); proposals, quotes and content libraries belong to Platter (or PandaDoc). Inkwell signs and hands off.
- **Heavy document work.** Document conversion and PDF sealing run in an isolated service with streamed object storage, not inside request handlers; that is engineering work recorded in `PREP-001` and `RECORD-003`, not a cut in scope.
- **Providers the buyer supplies.** Mail, SMS (US 10DLC registration through Twilio), identity, payment, AI and integration accounts are the buyer's or Inkwell's registered relays; Inkwell records each provider outcome and does not guarantee carrier or inbox delivery.
- **US first.** USD costs, US time zones and business days, English and Spanish, and ESIGN/UETA are the defaults; other jurisdictions' signature rules are not claimed until their own profile is written.

## Scope coverage

How the owner-approved scope for Inkwell (16 October 2026) maps to clauses.

| Scope item | Clauses |
| --- | --- |
| Reusable templates with saved roles, AI field detection on uploaded PDF and DOCX, and multi-document envelopes | `TMPL-001` to `TMPL-005`, `PREP-001`, `PREP-002`, `PREP-006`, `PREP-007`, `PREP-010` |
| Arbitrary recipient counts with sequential, parallel, CC, approver and conditional routing | `ROUTE-001` to `ROUTE-012` |
| Automatic reminders, expiry, bounce handling, resend, recipient correction and decline | `DELIV-001` to `DELIV-008`, `SIGNX-004` |
| Bulk send and public signing web forms | `BULK-001`, `FORM-001` |
| REST API, embedded signing, completion webhooks, HubSpot, Salesforce, Google Drive, OneDrive and Locket | `API-001` to `API-004`, `INTEG-001` to `INTEG-011` |
| SMS OTP, access code, ID verification, mobile-first signing with initials, dates, checkboxes and payments | `IDV-001` to `IDV-005`, `SIGNX-001` to `SIGNX-009`, `PREP-003`, `INTEG-010`, `MOBILE-001`, `MOBILE-002` |
| Import from each named incumbent and up-and-comer | `MOVE-001` to `MOVE-008` |
| Push further: assemble, fill, chase, verify and complete downstream work | `AGENT-001` to `AGENT-009` |

## Status

Judged from the code and tests at commit `a78e38ffeb5588d9825b3da9cc72aafd7dd9a33e` (17 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 10 | 0 | 0 | 10 |
| Target and push further | 0 | 30 | 73 | 103 |
| All | 10 | 30 | 73 | 113 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `HTTP-001` | Health, API and document routing | published | done | `tests/runtime.mjs`; `src/inkwell/api.ts` |  |
| `ACCESS-001` | Server-side roles and scoped authority | published | done | `tests/api.test.mjs`; `src/inkwell/api.ts`; `src/inkwell/storage.ts` |  |
| `SEND-001` | Prepare a fixed PDF for ordered signers | published | done | `tests/api.test.mjs`; `src/inkwell/envelopes.ts`; `src/ui/prepare-envelope.tsx` |  |
| `SIGN-001` | Email-verified, consented, ordered signing | published | done | `tests/api.test.mjs`; `src/inkwell/signing.ts` |  |
| `SEND-002` | Void an unfinished envelope | published | done | `tests/api.test.mjs`; `src/inkwell/envelopes.ts` |  |
| `DELEGATE-001` | Preparation agents never send | published | done | `tests/api.test.mjs`; `src/inkwell/agents.ts` |  |
| `RECORD-001` | Executed PDF, certificate and verifiable audit trail | published | done | `tests/api.test.mjs`; `src/inkwell/pdf.ts`; `src/inkwell/envelopes.ts` |  |
| `MOVE-001` | DocuSeal archive move-in | published | done | `tests/api.test.mjs`; `src/inkwell/imports/index.ts`; `tests/fixtures/docuseal/archive.json` |  |
| `PORT-001` | Whole-installation export and restore | published | done | `tests/api.test.mjs`; `src/inkwell/archive.ts` |  |
| `ERASE-001` | Erasure with a restore fence | published | done | `tests/api.test.mjs`; `src/inkwell/archive.ts` |  |
| `PREP-001` | PDF and Word uploads at business size | target | partial | `src/inkwell/pdf.ts`; `src/inkwell/blobs.ts` | PDF only, up to 2 MiB, stored in D1 rows; no DOCX or image conversion and no object storage |
| `PREP-002` | Multi-document envelopes | target | missing |  | One document per envelope |
| `PREP-003` | The complete field set with validation | target | partial | `src/inkwell/pdf.ts` | Only signature, text and date fields, all required; no initials, checkbox, radio, dropdown, attachment, number or pattern validation |
| `PREP-004` | Conditional and calculated fields | target | missing |  | No conditional or calculated fields |
| `PREP-005` | Direct field placement and editing | target | partial | `src/ui/prepare-envelope.tsx`; `src/ui/pdf-viewer.tsx` | Click placement at a fixed size; no drag, resize, duplicate, align, reassign, keyboard placement or journey test |
| `PREP-006` | AI field and recipient detection | target | missing |  | No AI field or recipient detection |
| `PREP-007` | Text tags and existing PDF form fields | target | missing |  | No text tags or AcroForm field import |
| `PREP-008` | Prefill from business data | target | missing |  | No sender, CRM or API prefill |
| `PREP-009` | Messages, drafts and scheduled sending | target | partial | `src/inkwell/envelopes.ts` | A prepared envelope is saved before approval but cannot be edited; no subject, messages or scheduled sending |
| `PREP-010` | Copy an envelope | target | missing |  | No envelope copy |
| `TMPL-001` | Reusable templates with saved roles | target | missing |  | No templates |
| `TMPL-002` | Shared team templates | target | missing |  | No shared templates |
| `TMPL-003` | Template versions that never change sent envelopes | target | missing |  | No template versions |
| `TMPL-004` | Several templates in one envelope | target | missing |  | No templates, so no combining several in one envelope |
| `TMPL-005` | Template matching on upload | target | missing |  | No template matching on upload |
| `ROUTE-001` | Any number of recipients and roles | target | partial | `src/inkwell/envelopes.ts` | One to five signers only; no approver, form filler, witness, in-person or copy roles |
| `ROUTE-002` | Sequential, parallel and mixed order | target | partial | `src/inkwell/signing.ts`; `tests/api.test.mjs` | Sequential order only; no parallel or mixed order |
| `ROUTE-003` | Conditional routing | target | missing |  | No conditional routing |
| `ROUTE-004` | Internal approval before sending | target | missing |  | No internal approver step beyond the sender's own approval |
| `ROUTE-005` | Signing groups | target | missing |  | No signing groups |
| `ROUTE-006` | Delegation and reassignment | target | missing |  | No delegation or reassignment |
| `ROUTE-007` | Hosted in-person signing | target | missing |  | No hosted in-person signing |
| `ROUTE-008` | Contacts and recent recipients | target | missing |  | No contact book |
| `ROUTE-009` | Sign it yourself | target | missing |  | Members cannot sign in the app; every signer verifies a mailbox code from an invitation, and no signature is saved |
| `ROUTE-010` | Witnesses nominated by their signer | target | missing |  | No witness role |
| `ROUTE-011` | Recipients who name, edit or only view | target | missing |  | No specify-recipients, editor, needs-to-view or certified-delivery recipients |
| `ROUTE-012` | Document visibility per recipient | target | missing |  | One document per envelope; no per-recipient visibility |
| `SIGNX-001` | Guided mobile-first signing | target | partial | `src/ui/signer-app.tsx` | Responsive signing page only; no guided Next flow, progress count or mobile journey test |
| `SIGNX-002` | Draw, type or upload signatures and initials | target | partial | `src/inkwell/pdf.ts` | Typed signature only; no drawn or uploaded signature, no initials, no adoption record |
| `SIGNX-003` | Accessible signing | target | partial | `src/ui/signer-app.tsx` | Labelled form controls only; no WCAG audit, keyboard or screen-reader journey |
| `SIGNX-004` | Decline with reason | target | missing |  | No decline |
| `SIGNX-005` | ESIGN and UETA consumer disclosure | target | partial | `src/inkwell/signing.ts` | Explicit consent statement only; no versioned ESIGN disclosure, withdrawal or paper-copy request |
| `SIGNX-006` | Branded sending and signing | target | missing |  | No customer branding |
| `SIGNX-007` | English and Spanish signing | target | missing |  | English only |
| `SIGNX-008` | Signer document actions and paper signing | target | partial | `src/inkwell/signing.ts`; `src/ui/signer-app.tsx` | The verified signer reviews every page in the viewer; no download or print action before signing and no paper-signing path |
| `SIGNX-009` | Recipient comments and supplemental documents | target | missing |  | No comments or supplemental documents |
| `IDV-001` | Per-recipient authentication choice | target | partial | `src/inkwell/signing.ts` | Email code is the only method and is always required |
| `IDV-002` | SMS one-time codes | target | missing |  | No SMS codes |
| `IDV-003` | Access codes | target | missing |  | No access codes |
| `IDV-004` | Identity document verification through a provider | target | missing |  | No identity verification provider |
| `IDV-005` | Knowledge-based and phone authentication | target | missing |  | No knowledge-based or phone authentication |
| `DELIV-001` | Live delivery with per-message status | target | partial | `src/inkwell/mail.ts` | Sent and uncertain states only; no delivered, opened or bounced events from provider webhooks |
| `DELIV-002` | Bounces and bad addresses | target | missing |  | No bounce handling |
| `DELIV-003` | Automatic reminders | target | missing |  | No reminders |
| `DELIV-004` | Configurable expiry with warnings | target | partial | `src/inkwell/envelopes.ts` | Fixed seven-day expiry; no setting, warnings or extension |
| `DELIV-005` | Resend by email or SMS | target | missing |  | Only verification codes can be re-requested; no invitation resend or SMS |
| `DELIV-006` | Correct an envelope in flight | target | missing |  | No in-flight correction |
| `DELIV-007` | Completed copies to every party | target | partial | `src/inkwell/signing.ts` | Signers can download after completion; no automatic distribution or copy recipients |
| `DELIV-008` | Sender notifications | target | missing |  | No sender notifications |
| `BULK-001` | Bulk send from a spreadsheet | target | missing |  | No bulk send |
| `FORM-001` | Public signing web forms | target | missing |  | No web forms |
| `MANAGE-001` | Envelope dashboard with search | target | partial | `src/inkwell/api.ts`; `src/ui/operator-app.tsx` | Unpaged list of every envelope with its status; no search, filters or waiting lists |
| `MANAGE-002` | Folders, tags and custom envelope fields | target | missing |  | No folders, tags or custom fields |
| `MANAGE-003` | Waiting for me | target | missing |  | No in-app waiting-for-me list |
| `MANAGE-004` | Reports and exports | target | missing |  | No reports |
| `MANAGE-005` | Envelope detail and timeline | target | partial | `src/ui/envelope-detail.tsx` | Detail page lists signers with signed times and the audit trail; no delivered or viewed timeline, waiting state, remind, resend, correct or copy actions |
| `RECORD-002` | Per-recipient certificate evidence | target | partial | `src/inkwell/pdf.ts` | Certificate lists signers, times and event hashes; no IP, per-recipient authentication, adoption method, disclosure version or local time zone |
| `RECORD-003` | Sealed PDFs | target | missing |  | No PDF digital seal; the certificate says it is not one |
| `RECORD-004` | Public verification | target | partial | `src/inkwell/envelopes.ts`; `tests/api.test.mjs` | Fingerprint verification for signed-in members only; no public upload-to-verify page |
| `RECORD-005` | Retention and legal hold | target | missing |  | No retention rules or legal hold |
| `ADMIN-001` | Roles and envelope sharing | target | partial | `src/inkwell/api.ts`; `tests/api.test.mjs` | Owner, admin and member roles all see every envelope; no sender privacy, viewer role or sharing |
| `ADMIN-002` | Members, groups and departures | target | partial | `src/modules/operator-auth/accounts/admin.mjs` | Invitations and roles from Base; no groups or transfer of a departing member's envelopes |
| `ADMIN-003` | SSO and SCIM | target | partial | `src/modules/operator-auth/identity/oidc/index.mjs` | OIDC sign-in from Base; no SAML or SCIM |
| `ADMIN-004` | Account defaults and sending policies | target | missing |  | No account defaults or sending policies |
| `ADMIN-005` | Account audit log | target | missing |  | No account audit log |
| `ADMIN-006` | Transparent usage and cost | target | missing |  | No usage page or cost caps |
| `ADMIN-007` | First-day setup and readiness | target | partial | `src/base/setup.ts`; `src/base/setup-state.ts` | Owner claim and first-run confirmation only; no domain, SPF, DKIM or DMARC checks, provider tests or readiness gate |
| `API-001` | Public REST API | target | partial | `src/inkwell/api.ts`; `tests/api.test.mjs` | Agent preparation endpoint with idempotent command IDs only; no API keys, OAuth, OpenAPI or send, status and download for API clients |
| `API-002` | Signed webhooks with retries | target | missing |  | No webhooks |
| `API-003` | Embedded signing and sending | target | missing |  | No embedded signing or sending |
| `API-004` | SDKs and test mode | target | missing |  | No SDKs or test mode |
| `INTEG-001` | HubSpot | target | missing |  | No HubSpot connector |
| `INTEG-002` | Salesforce | target | missing |  | No Salesforce connector |
| `INTEG-003` | Orbit | target | missing |  | No Orbit connector |
| `INTEG-004` | Google Workspace | target | missing |  | No Google Workspace connector |
| `INTEG-005` | Microsoft 365 | target | missing |  | No Microsoft 365 connector |
| `INTEG-006` | Box and Dropbox | target | missing |  | No Box or Dropbox connector |
| `INTEG-007` | Chest | target | missing |  | No Chest connector |
| `INTEG-008` | Locket handoff | target | partial | `src/inkwell/envelopes.ts`; `tests/api.test.mjs` | Downloadable handoff manifest only; no delivery to Locket |
| `INTEG-009` | Zapier, Make, Power Automate, n8n and Crank | target | missing |  | No automation apps |
| `INTEG-010` | Payment at signing through Stripe | target | missing |  | No payment at signing |
| `INTEG-011` | Signing service for sibling products | target | missing |  | No scoped API for sibling products |
| `MOBILE-001` | Responsive sending and tracking | target | partial | `public/app/shell.css`; `public/app/envelopes.css` | Responsive operator layout; no 390-pixel sending journey test or PWA install |
| `MOBILE-002` | Native iOS and Android apps | target | missing |  | No native apps |
| `MOVE-002` | Docusign move-in | target | missing |  | No Docusign import |
| `MOVE-003` | Adobe Acrobat Sign move-in | target | missing |  | No Adobe Acrobat Sign import |
| `MOVE-004` | Dropbox Sign move-in | target | missing |  | No Dropbox Sign import |
| `MOVE-005` | Documenso move-in | target | missing |  | No Documenso import |
| `MOVE-006` | Cutover of in-flight envelopes | target | missing |  | No in-flight cutover |
| `MOVE-007` | API compatibility for common calls | target | missing |  | No API compatibility layer |
| `MOVE-008` | Throttled, resumable imports at account size | target | partial | `src/inkwell/imports/index.ts`; `src/modules/import-kit/src/d1/index.ts` | Checkpointed, resumable apply for archive imports only; no remote API pull, rate-limit pause or duplicate-free resume of a remote import |
| `PORT-002` | Self-service export at any size | target | partial | `src/inkwell/archive.ts` | Whole-installation archive capped at 24 MiB in the browser; no selective export, CSV index or resumable streaming |
| `COMPLY-001` | 21 CFR Part 11 signing profile | target | missing |  | No Part 11 profile |
| `COMPLY-002` | HIPAA-ready installation | target | missing |  | No HIPAA-ready profile |
| `AGENT-001` | Assemble the envelope from CRM and email context | push-further | partial | `src/inkwell/agents.ts`; `tests/api.test.mjs` | Agents prepare envelopes for human approval; no CRM or email context assembly |
| `AGENT-002` | Fill what is missing | push-further | missing |  | No missing-information agent |
| `AGENT-003` | Chase stalled signers under the sender's rules | push-further | missing |  | No follow-up agent |
| `AGENT-004` | Verify the intended revision and parties | push-further | partial | `src/inkwell/envelopes.ts` | Signers sign the approved fingerprinted bytes; no comparison with an external approved revision or signer-authority check |
| `AGENT-005` | Complete the downstream work | push-further | missing |  | No downstream effects |
| `AGENT-006` | Keep integrations correct | push-further | missing |  | No integration reconciliation |
| `AGENT-007` | Keep templates current | push-further | missing |  | No template maintenance agent |
| `AGENT-008` | Signer assistant | push-further | missing |  | No signer assistant |
| `AGENT-009` | Inbound agreements | push-further | missing |  | No inbound agreement handling |
