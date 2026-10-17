# Acceptance

Every clause in [CONTRACT.md](CONTRACT.md) is accepted by the journey listed here, run through a public door: the browser at 1440 and 390 pixels wide, the HTTP API, a signing link, or a provider fake at the paid or network edge. Status is the contract's, judged at commit `e1c3a8c` (17 October 2026); a build round moves a clause to done by making its journey pass, and an independent release review follows.

## First release

- **HTTP-001 — Health, API and document routing** (done). The built Worker answers `/health` with its deployment fingerprint, source and version, serves the application document, and returns 404 for unknown routes.
- **ACCESS-001 — Server-side roles and scoped authority** (done). Signed-out, member, admin, owner and agent-token requests to every document, import, agent and archive door return the documented allow or refuse, and a cross-origin change is refused.
- **SEND-001 — Prepare a fixed PDF for ordered signers** (done). Prepare an envelope through the API, fail approval without the eligibility confirmation, approve it, and show recipients and fields cannot change afterwards.
- **SIGN-001 — Email-verified, consented, ordered signing** (done). Two signers verify codes, reject a wrong code, cannot sign out of turn, consent and sign in order, and the second invitation arrives only after the first signature.
- **SEND-002 — Void an unfinished envelope** (done). Void an envelope after sending and show the invitation link refuses and the pending message is cancelled.
- **DELEGATE-001 — Preparation agents never send** (done). An agent token prepares an envelope but cannot approve, sign or read archives, and fails after revocation; the audit trail names the agent and the approving person.
- **RECORD-001 — Executed PDF, certificate and verifiable audit trail** (done). Complete an envelope, download every artifact, and show recomputed document and audit fingerprints agree with the stored values and the handoff manifest.
- **MOVE-001 — DocuSeal archive move-in** (done). Dry run, fingerprint approval, import, journal, downloads and undo of the DocuSeal fixture, with custody preserved at every step.
- **PORT-001 — Whole-installation export and restore** (done). Export validates its contents, a populated installation refuses restore, and a fresh installation restores the executed file, certificate and full import journal.
- **ERASE-001 — Erasure with a restore fence** (done). Erase an envelope, show its files and identity custody are gone, and show a fresh-store restore with the later journal refuses resurrection while restoring everything else.

## Target

### Documents and fields

- **PREP-001 — PDF and Word uploads at business size** (partial). Upload a 20 MB PDF, a DOCX with tables and images, and a phone photo of a page; each converts, previews and signs with a fingerprint over the converted PDF; an encrypted PDF and a 30 MB file are refused with their reasons.
- **PREP-002 — Multi-document envelopes** (missing). Send an envelope with a service agreement, a W-9 and a view-only policy; two signers complete it in one session each; the record contains three executed documents, a combined PDF and one certificate covering all three fingerprints.
- **PREP-003 — The complete field set with validation** (partial). A template with every field type is signed on desktop and phone; invalid ZIP, phone and EIN values are refused with field-level messages; attachments land in the record; masked values are hidden in the dashboard but present in the executed PDF.
- **PREP-004 — Conditional and calculated fields** (missing). A signer checks a box that reveals two required fields, then unchecks it and finishes without them; a calculated total updates live and prints in the executed PDF.
- **PREP-005 — Direct field placement and editing** (partial). At 1440 and 390 pixels, place twelve fields across three pages by pointer and by keyboard, duplicate one to every page, reassign two to another signer, and save without losing a field.
- **PREP-006 — AI field and recipient detection** (missing). Upload an unmarked two-party service agreement; at least the two signature blocks, dates and printed names are proposed in the right places and parties; the sender rejects one, accepts the rest and the envelope records which fields came from detection.
- **PREP-007 — Text tags and existing PDF form fields** (missing). A DOCX with text tags and a fillable IRS W-9 PDF both prepare with no manual placement, and the W-9's named fields prefill through the API.
- **PREP-008 — Prefill from business data** (missing). Send from a template with a HubSpot-fake deal; company, address and amount prefill with their source shown in the record, and the signer cannot change the locked amount.
- **PREP-009 — Messages, drafts and scheduled sending** (partial). Save a draft, reopen it, add private messages, schedule it for the next business day at 9:00 America/Chicago and show it sends then with each recipient seeing only their own private message.

### Templates

- **TMPL-001 — Reusable templates with saved roles** (missing). Create a template with three roles, send it twice to different people, and show each envelope inherited fields, routing, reminders and expiry with no placement.
- **TMPL-002 — Shared team templates** (missing). A member sees and uses a shared template but cannot edit it; an editor changes it; a member without access cannot find it through the UI or API.
- **TMPL-003 — Template versions that never change sent envelopes** (missing). Send from version 1, edit the template, send again; the first envelope still shows version 1 fields and the second version 2; saving the first as a template reproduces its fields and roles.

### Recipients and routing

- **ROUTE-001 — Any number of recipients and roles** (partial). Send to eight signers, one approver, one form filler and three copy recipients; each sees only their own actions; copy recipients receive only the completed record.
- **ROUTE-002 — Sequential, parallel and mixed order** (partial). Recipients at orders 1, 2, 2 and 3; both order-2 recipients are invited together after order 1, and order 3 is invited only after both finish.
- **ROUTE-003 — Conditional routing** (missing). Two envelopes from one template with amounts of 5,000 and 25,000 USD; only the second routes to the finance director, and the first's certificate names the skipped step and its rule.
- **ROUTE-004 — Internal approval before sending** (missing). A sender's envelope above the rule's threshold waits for the approver; a rejection returns it to the sender with the reason; an approval sends it.
- **ROUTE-005 — Signing groups** (missing). Send to the "Company Signers" group of three; one member signs, the others' links show it is done, and the certificate names the signer and the group.
- **ROUTE-006 — Delegation and reassignment** (missing). A signer reassigns to a colleague; the colleague verifies and signs; the original link refuses; a disallowed reassignment is refused.
- **ROUTE-007 — Hosted in-person signing** (missing). An admin hosts an in-person signer at 768 pixels, the signer signs, and the certificate records the host, the attestation and the device.
- **ROUTE-008 — Contacts and recent recipients** (missing). Import 200 contacts from CSV, autocomplete a recipient by company, and show a CRM-fake contact appears after sync.

### Signer experience

- **SIGNX-001 — Guided mobile-first signing** (partial). A signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes; the journey records time to first page under 3 seconds on a throttled mobile profile.
- **SIGNX-002 — Draw, type or upload signatures and initials** (partial). One signer draws on a touch screen, another types and a third uploads; all three appear in the executed PDF and the certificate records each method.
- **SIGNX-003 — Accessible signing** (partial). An automated accessibility scan with no serious violations on the signing and preparation pages, plus a keyboard-only and a screen-reader journey that complete an envelope.
- **SIGNX-004 — Decline with reason** (missing). The second signer declines; the third is never invited, the sender receives a notice with the reason, and the certificate records the decline.
- **SIGNX-005 — ESIGN and UETA consumer disclosure** (partial). A new signer sees and accepts the disclosure; a second signer withdraws consent and the envelope stops with the withdrawal recorded; the certificate quotes the disclosure version.
- **SIGNX-006 — Branded sending and signing** (missing). Two brands on two templates; invitations and signing pages show each brand's logo and colours, and email headers use its reply-to and domain.
- **SIGNX-007 — English and Spanish signing** (missing). A recipient set to Spanish receives a Spanish invitation, signs on Spanish pages and receives a Spanish completion email; the certificate shows the language used.

### Signer identity

- **IDV-001 — Per-recipient authentication choice** (partial). One envelope with four recipients using four different methods; each must pass their own method, and the certificate lists each method and result.
- **IDV-002 — SMS one-time codes** (missing). Through an SMS provider fake, a recipient receives and enters a code, a wrong code and an expired code are refused, and the certificate records the masked number.
- **IDV-003 — Access codes** (missing). A recipient is refused with a wrong code, locked after five attempts, and admitted with the right one.
- **IDV-004 — Identity document verification through a provider** (missing). Through a provider fake, a matching verification admits the signer, a failed one refuses with a retry, and the record holds only the reference and outcome.

### Delivery and follow-up

- **DELIV-001 — Live delivery with per-message status** (partial). Through a mail provider fake, a sent invitation moves to delivered and opened from provider webhooks, and an uncertain send is shown as uncertain with no duplicate.
- **DELIV-002 — Bounces and bad addresses** (missing). A bounce event marks the recipient, the sender is alerted, corrects the email and the corrected recipient signs.
- **DELIV-003 — Automatic reminders** (missing). With the clock advanced, a current signer receives reminders on days 2, 4 and 6 skipping a weekend, a waiting signer receives none, and reminders stop after the signature.
- **DELIV-004 — Configurable expiry with warnings** (partial). An envelope set to expire in 10 days warns on day 7, the sender extends it by 14 days, and the signer signs on day 12.
- **DELIV-005 — Resend by email or SMS** (missing). Resend by SMS through the provider fake, the signer opens the SMS link and signs; after rotation the old link refuses.
- **DELIV-006 — Correct an envelope in flight** (missing). After signer 1 signs, correct signer 2's email and add a copy recipient; signer 1's signature stands, the old link for signer 2 refuses, and the new one completes the envelope.
- **DELIV-007 — Completed copies to every party** (partial). Complete an envelope with two signers and a copy recipient; all three receive the completed copy through the mail fake, and secure links require their mailbox code.
- **DELIV-008 — Sender notifications** (missing). A sender subscribed to declines and completions in Slack and email receives each from the respective fakes and nothing else.

### Bulk send and web forms

- **BULK-001 — Bulk send from a spreadsheet** (missing). Upload 500 rows with three invalid emails; the preview marks the three, the sender sends the rest, and the batch shows each envelope's status as they complete.
- **FORM-001 — Public signing web forms** (missing). Open a form link signed out, verify an email and sign; the company signer countersigns; a bot request without a Turnstile token and a submission past the limit are refused.

### Envelope management and reporting

- **MANAGE-001 — Envelope dashboard with search** (partial). With 5,000 envelopes, search by recipient email returns in under one second and each status filter shows the right count.
- **MANAGE-002 — Folders, tags and custom envelope fields** (missing). A template adds a required cost-center field; envelopes are filtered and exported by it and the HubSpot fake receives it.
- **MANAGE-003 — Waiting for me** (missing). An admin is the second signer of a colleague's envelope and signs from the in-app list after the first signer finishes.
- **MANAGE-004 — Reports and exports** (missing). A fixture of 300 envelopes produces the expected counts and median turnaround, and the CSV matches the report.

### Execution evidence

- **RECORD-002 — Per-recipient certificate evidence** (partial). Complete an envelope with email-code and SMS-code signers and show each item on the certificate matches the audit trail.
- **RECORD-003 — Sealed PDFs** (missing). Open the executed PDF in a PDF validator to show a valid seal; modify one byte and show the seal fails.
- **RECORD-004 — Public verification** (partial). A signed-out visitor verifies a genuine executed PDF, an altered copy fails, and an unrelated PDF reveals nothing.
- **RECORD-005 — Retention and legal hold** (missing). With the clock advanced, a seven-year rule purges an envelope after its warning, and a held envelope survives both the rule and an erase request.

### Team administration

- **ADMIN-001 — Roles and envelope sharing** (partial). Two senders cannot see each other's envelopes until one shares a folder; a viewer can read but not send; the API enforces the same boundaries.
- **ADMIN-002 — Members, groups and departures** (partial). Deactivate a sender with two in-flight envelopes; transfer them; both complete and notify the new owner.
- **ADMIN-003 — SSO and SCIM** (partial). Through IdP fakes, an OIDC and a SAML sign-in succeed, a SCIM create adds a member and a SCIM deactivate ends their sessions.
- **ADMIN-004 — Account defaults and sending policies** (missing). Change each default and show new envelopes inherit it; a templates-only policy refuses an ad hoc upload by a sender.
- **ADMIN-005 — Account audit log** (missing). Change a template, a role and an integration; the log shows all three with before and after values and exports them.
- **ADMIN-006 — Transparent usage and cost** (missing). With an SMS cap of 5 USD, sending past the cap warns, then stops SMS codes while email codes continue, and the usage page shows the totals.

### Developer platform

- **API-001 — Public REST API** (partial). A client creates, sends, polls, downloads and voids envelopes using only the published OpenAPI document; a repeated idempotency key returns the first result; a key without the send scope is refused.
- **API-002 — Signed webhooks with retries** (missing). A receiver fake fails twice then succeeds; the log shows three attempts; a replay delivers the same event ID; a tampered signature is rejected by the documented verification.
- **API-003 — Embedded signing and sending** (missing). A test page on an allowed origin embeds signing and receives the signed event; an unlisted origin is refused; embedded preparing creates and sends an envelope.
- **API-004 — SDKs and test mode** (missing). The SDK examples run against a test-mode key; test envelopes are watermarked and absent from production reports and webhooks.

### Integrations

- **INTEG-001 — HubSpot** (missing). Through a HubSpot fake, send from a deal, complete it and show the deal's properties, timeline event and attached PDF updated once.
- **INTEG-002 — Salesforce** (missing). Through a Salesforce fake, send from an Opportunity, complete it and show field write-back and the attached file.
- **INTEG-003 — Orbit** (missing). Through Orbit's API in a test installation, send from a deal and show the completed record on it.
- **INTEG-004 — Google Workspace** (missing). Through a Google fake, send a Drive document and show the completed PDF and certificate in the configured folder.
- **INTEG-005 — Microsoft 365** (missing). Through a Microsoft Graph fake, send a OneDrive document and show the completed record filed in the SharePoint folder.
- **INTEG-006 — Box and Dropbox** (missing). Through Box and Dropbox fakes, a completion files the PDF and certificate once each, and a retry does not duplicate.
- **INTEG-007 — Chest** (missing). In a test installation of Chest, a completion appears in the configured Chest folder with its fingerprint.
- **INTEG-008 — Locket handoff** (partial). A Locket-initiated envelope completes and Locket shows the executed record against the approved revision; a downloaded handoff manifest still verifies offline.
- **INTEG-009 — Zapier, Make, Power Automate, n8n and Crank** (missing). Each app's test harness triggers on a completion and sends from a template.
- **INTEG-010 — Payment at signing through Stripe** (missing). In Stripe test mode, a signer pays a 500 USD deposit and the envelope completes with the payment reference; a declined card leaves the envelope waiting with the signature unsaved.
- **INTEG-011 — Signing service for sibling products** (missing). A Lodge-style client sends an offer letter from a template and receives the completion webhook and executed PDF.

### Mobile

- **MOBILE-001 — Responsive sending and tracking** (partial). At 390 pixels, send from a template, remind a signer and void an envelope.
- **MOBILE-002 — Native iOS and Android apps** (missing). On iOS and Android simulators, scan a two-page document, send it and receive a push notification on completion.

### Migration and portability

- **MOVE-002 — Docusign move-in** (missing). Through a Docusign API fake with 50 envelopes and five templates, preview, import, open an imported certificate and send from an imported template; the unmapped list names each skipped field type.
- **MOVE-003 — Adobe Acrobat Sign move-in** (missing). Through an Acrobat Sign API fake, import agreements and a library template and send from it.
- **MOVE-004 — Dropbox Sign move-in** (missing). Through a Dropbox Sign API fake, import requests and templates and send from one.
- **MOVE-005 — Documenso move-in** (missing). Through a Documenso fake, import documents and a template and send from it.
- **MOVE-006 — Cutover of in-flight envelopes** (missing). A fake with two in-flight envelopes; one completes after cutover and is imported, the other is voided upstream and is listed as voided.
- **MOVE-007 — API compatibility for common calls** (missing). A client written against the incumbent's documented requests runs unchanged against the compatibility layer for create, send, status, download and void.
- **PORT-002 — Self-service export at any size** (partial). Export 2 GB of envelopes, interrupt and resume, and restore into an empty installation with every fingerprint verified.

### Compliance profiles

- **COMPLY-001 — 21 CFR Part 11 signing profile** (missing). With the profile on, a signer re-authenticates and picks a reason; the executed PDF shows the manifestation; the validation package lists the tests run.
- **COMPLY-002 — HIPAA-ready installation** (missing). In the profile, logs contain no field values or document text after a full signing journey, and the access review report lists every member's last access.

## Push further

### Agents that carry the agreement

- **AGENT-001 — Assemble the envelope from CRM and email context** (partial). From a CRM-fake deal and email-fake thread, the agent drafts an envelope whose prefilled values each cite their source; the sender edits one and sends; a request with no matching template is refused with a reason.
- **AGENT-002 — Fill what is missing** (missing). A draft missing the client signer's title and the W-9; the agent asks the right people, merges both answers with sources, and flags a reply that changes the price instead of applying it.
- **AGENT-003 — Chase stalled signers under the sender's rules** (missing). Three stalled signers (bounce, out-of-office until Monday, reply objecting to a clause); the agent proposes a corrected address, waits until Monday, and routes the objection to the sender, staying within the contact limit.
- **AGENT-004 — Verify the intended revision and parties** (partial). An envelope whose second page differs from the Locket-approved revision is stopped before sending with the differing text; a completed envelope signed by a person without signing authority raises an exception and the downstream handoff waits.
- **AGENT-005 — Complete the downstream work** (missing). A completion produces one deal update, one filed record and one onboarding task through fakes; a replayed webhook creates nothing new; a refused grant leaves its effect open with the reason.
- **AGENT-006 — Keep integrations correct** (missing). Rename a CRM field in the fake; the agent detects failed write-backs, proposes the new mapping, and after approval replays them without duplicates.
- **AGENT-007 — Keep templates current** (missing). Ten envelopes where senders added the same field; the agent proposes adding it with the ten examples cited; the owner accepts and version 2 is published.
- **AGENT-008 — Signer assistant** (missing). A signer asks what the termination notice period is and receives the answer with its page cited; a request to sign for them is refused; the sender sees no question unless the signer sends it.
- **AGENT-009 — Inbound agreements** (missing). Forward a vendor NDA; the agent identifies the internal signer by role, prepares it for them, and after they sign returns the executed copy only when the grant allows.

## Not in Inkwell

Inkwell does not process payments (Stripe does), notarize, issue qualified signatures, verify identity documents itself (a provider does), give legal advice or claim universal validity; imported signatures keep their provider provenance. CONTRACT.md "Honest boundaries" says how buyers get each. Local use needs no live mail or provider calls: acceptance journeys use provider fakes, and live provider receipt is recorded separately.
