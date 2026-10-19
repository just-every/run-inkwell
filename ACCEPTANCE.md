# Acceptance

Every clause in [CONTRACT.md](CONTRACT.md) is accepted by the journey listed here, run through a public door: the browser at 1440 and 390 pixels wide, the HTTP API, a signing link, or a provider fake at the paid or network edge. Status is the contract's, judged at commit `a78e38f` (17 October 2026). Where a first-release journey names today's narrowed case, the target clause it references governs (CONTRACT.md, "How to read this contract"); a build round moves a clause to done by making its journey pass, and an independent release review follows.

## First release

- **HTTP-001 — Health, API and document routing** (done). The built Worker answers `/health` with its deployment fingerprint, source and version, serves the application document, and returns 404 for unknown routes.
- **ACCESS-001 — Server-side roles and scoped authority** (partial). Signed-out, viewer, sender, admin, owner and agent-token requests to every document, import, agent and archive door return the allow or refuse that `ADMIN-001`'s matrix documents; a sender-role member prepares, sends and voids their own envelope and is refused on another sender's unshared envelope; a cross-origin change is refused.
- **SEND-001 — Prepare a fixed envelope and authorize sending** (partial). Prepare an envelope through the API; an ad hoc approval without the eligibility confirmation is refused and one with it sends; a `FORM-001` submission and an `API-001` send-scope call each produce a sent envelope with no human approval step, and each record names the sending policy and credential that allowed it; with the policy for API sends turned off, the same call is refused; after signer 1 signs, a `DELIV-006` correction of signer 2's email succeeds and is audited, while any change to signer 1's signed field, direct or through a correction, is refused.
- **SIGN-001 — Authenticated, consented signing in routing order** (partial). Two email-code signers verify codes, reject a wrong code, cannot sign out of turn, consent and sign in order, and the second invitation arrives only after the first signature; a link-only recipient signs with no code; two order-1 signers are invited together and sign in parallel, and order 2 is invited only after both have signed.
- **SEND-002 — Void an unfinished envelope** (partial). A sender-role member voids their own envelope after sending and is refused on another sender's unshared envelope; the voided envelope's invitation link refuses and the pending message is cancelled.
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
- **PREP-006 — AI field and recipient detection** (missing). Upload the unmarked two-party service agreement fixture, whose two signature lines, two date lines and two printed-name lines sit at recorded page coordinates; all six are proposed, each on the right page and party, with its centre within 12 points (one sixth of an inch) of the recorded position and its width and height within 25% of the recorded box; no signature field is proposed away from a recorded position; the sender rejects one, accepts the rest and the envelope records which fields came from detection.
- **PREP-007 — Text tags and existing PDF form fields** (missing). A DOCX with text tags and a fillable IRS W-9 PDF both prepare with no manual placement, and the W-9's named fields prefill through the API.
- **PREP-008 — Prefill from business data** (missing). Send from a template with a HubSpot-fake deal; company, address and amount prefill with their source shown in the record, and the signer cannot change the locked amount.
- **PREP-009 — Messages, drafts and scheduled sending** (partial). Save a draft, reopen it, add private messages, schedule it for the next business day at 9:00 America/Chicago and show it sends then with each recipient seeing only their own private message.
- **PREP-010 — Copy an envelope** (done). Copy a completed envelope; the draft has the unsigned documents, the same recipients and fields and no signed values; send it, and its record names the source envelope.
- **PREP-011 — Free-form signing** (missing). Send a one-page letter with no fields to one signer; the signer places a signature and a date on page 1 and finishes, and the executed PDF shows both at the places chosen; finishing with no signature placed is refused; with the policy off, sending without fields is refused in the UI and API.
- **PREP-012 — Document generation from Word templates** (missing). Through the API, generate from a DOCX template with a client-name merge field, a line-item table fed three rows with a calculated USD total, and a section included only when a payload flag is true; the preview and the executed PDF show the name, three rows, the total and the section, and a second send with the flag false omits the section; a payload missing the client name is refused before sending, naming the field.

### Templates

- **TMPL-001 — Reusable templates with saved roles** (missing). Create a template with three roles, send it twice to different people, and show each envelope inherited fields, routing, reminders and expiry with no placement.
- **TMPL-002 — Shared team templates** (missing). A member sees and uses a shared template but cannot edit it; an editor changes it; a member without access cannot find it through the UI or API.
- **TMPL-003 — Template versions that never change sent envelopes** (missing). Send from version 1, edit the template, send again; the first envelope still shows version 1 fields and the second version 2; saving the first as a template reproduces its fields and roles.
- **TMPL-004 — Several templates in one envelope** (missing). An NDA template (role Client, order 1) and a W-9 template (role Client, order 1) go out as one envelope; the client signs both in one session and the certificate lists both template versions; a third template whose Client role sits at order 2 is shown as a separate recipient in the preview before sending; when the W-9 template requires an SMS code and the NDA an email code, the preview names the conflict and proposes the SMS code.
- **TMPL-005 — Template matching on upload** (missing). Upload a fresh copy of the W-9 a template uses; the match is offered and applying it places every template field; an unrelated agreement is offered nothing.

### Recipients and routing

- **ROUTE-001 — Any number of recipients and roles** (partial). Send to eight signers, one approver, one form filler and three copy recipients, where signer 1 must have a witness; each sees only their own actions; signer 1 nominates a witness who is invited only after signer 1 signs and before order 2; copy recipients receive only the completed record.
- **ROUTE-002 — Sequential, parallel and mixed order** (partial). Recipients at orders 1, 2, 2 and 3; both order-2 recipients are invited together after order 1, and order 3 is invited only after both finish.
- **ROUTE-003 — Conditional routing** (missing). Two envelopes from one template with amounts of 5,000 and 25,000 USD; only the second routes to the finance director, and the first's certificate names the skipped step and its rule.
- **ROUTE-004 — Internal approval before sending** (missing). A sender's envelope above the rule's threshold waits for the approver; a rejection returns it to the sender with the reason; an approval sends it.
- **ROUTE-005 — Signing groups** (missing). Send to the "Company Signers" group of three; one member signs, the others' links show it is done, and the certificate names the signer and the group.
- **ROUTE-006 — Delegation and reassignment** (missing). A signer reassigns to a colleague; the colleague verifies and signs; the original link refuses; a disallowed reassignment is refused.
- **ROUTE-007 — Hosted in-person signing** (missing). An admin hosts an in-person signer at 768 pixels, the signer signs, and the certificate records the host, the attestation and the device.
- **ROUTE-008 — Contacts and recent recipients** (missing). Import 200 contacts from CSV, autocomplete a recipient by company, and show a CRM-fake contact appears after sync.
- **ROUTE-009 — Sign it yourself** (missing). A member self-signs a three-page PDF and the mail fake records no message; the certificate names session authentication and the sign-in method; the member downloads the executed PDF and certificate and sends the completed copy to two addresses; a second self-signed document reuses the saved signature without adopting it again; on another envelope the sender at order 1 signs in the app right after approval, and the order-2 signer is invited only after that signature.
- **ROUTE-010 — Witnesses nominated by their signer** (missing). Signer 1 nominates a witness while signing; the witness is invited only after signer 1 signs and order 2 waits for the witness; the witness verifies, sees only signer 1's document and their own fields, not a document visible only to signer 2, and signs; the certificate names the witness against signer 1; nominating the signer's own email as witness is refused; a declining witness returns the step to signer 1, who nominates another.
- **ROUTE-011 — Recipients who name, edit or only view** (missing). An agent at order 1 names the order-3 signer, who is then invited; an editor at order 2 adds a field and changes a later recipient's email, and the audit trail shows both; a needs-to-view recipient blocks order 3 until they open the documents; a certified-delivery recipient's view time is on the certificate.
- **ROUTE-012 — Document visibility per recipient** (missing). An envelope with an offer letter and a compensation memo for the hiring manager: the candidate never sees the memo while signing, in downloads, in their completed copy or through the API recipient view; the manager sees and signs both; the certificate lists each recipient's visible documents.

### Signer experience

- **SIGNX-001 — Guided mobile-first signing** (partial). A signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes; the journey records time to first page under 3 seconds on a throttled mobile profile.
- **SIGNX-002 — Draw, type or upload signatures and initials** (partial). One signer draws on a touch screen, another types and a third uploads; all three appear in the executed PDF and the certificate records each method.
- **SIGNX-003 — Accessible signing** (partial). An automated accessibility scan with no serious violations on the signing and preparation pages, plus a keyboard-only and a screen-reader journey that complete an envelope.
- **SIGNX-004 — Decline with reason** (done). The second signer declines; the third is never invited, the sender receives a notice with the reason, and the certificate records the decline.
- **SIGNX-005 — ESIGN and UETA consumer disclosure** (partial). A new signer sees and accepts the disclosure; a second signer withdraws consent and the envelope stops with the withdrawal recorded; the certificate quotes the disclosure version.
- **SIGNX-006 — Branded sending and signing** (missing). Two brands on two templates; invitations and signing pages show each brand's logo and colours, and email headers use its reply-to and domain.
- **SIGNX-007 — English and Spanish signing** (missing). A recipient set to Spanish receives a Spanish invitation, signs on Spanish pages and receives a Spanish completion email; the certificate shows the language used.
- **SIGNX-008 — Signer document actions and paper signing** (partial). A signer downloads and prints the document before signing; on an envelope that allows paper signing, a signer uploads a three-page scan, the sender accepts it and the certificate marks the signature as wet ink with the scan's fingerprint; when paper signing is not allowed, the option is absent and the API refuses the upload.
- **SIGNX-009 — Recipient comments and supplemental documents** (missing). A signer comments on page 2, the sender replies, and the next signer sees the thread when it was shared with them; a supplemental handbook must be acknowledged before the signer can finish, and the certificate lists the acknowledgement and its time.

### Signer identity

- **IDV-001 — Per-recipient authentication choice** (partial). One envelope with four recipients using four different methods, one of them link only; each must pass their own method, the link-only recipient signs with no code, and the certificate lists each method and result.
- **IDV-002 — SMS one-time codes** (missing). Through an SMS provider fake, a recipient receives and enters a code, a wrong code and an expired code are refused, and the certificate records the masked number.
- **IDV-003 — Access codes** (done). A recipient is refused with a wrong code, locked after five attempts, and admitted with the right one.
- **IDV-004 — Identity document verification through a provider** (missing). Through a provider fake, a matching verification admits the signer, a failed one refuses with a retry, and the record holds only the reference and outcome.
- **IDV-005 — Knowledge-based and phone authentication** (missing). Through provider fakes, a recipient who passes the questions is admitted, one who fails twice is locked and the sender notified; a voice-call code admits a second recipient; the record holds only the references and outcomes.

### Delivery and follow-up

- **DELIV-001 — Live delivery with per-message status** (partial). Through a mail provider fake, a sent invitation moves to delivered and opened from provider webhooks, and an uncertain send is shown as uncertain with no duplicate.
- **DELIV-002 — Bounces and bad addresses** (missing). A bounce event marks the recipient, the sender is alerted, corrects the email and the corrected recipient signs.
- **DELIV-003 — Automatic reminders** (missing). With the clock advanced, a current signer receives reminders on days 2, 4 and 6 skipping a weekend, a waiting signer receives none, and reminders stop after the signature.
- **DELIV-004 — Configurable expiry with warnings** (partial). An envelope set to expire in 10 days warns on day 7, the sender extends it by 14 days, and the signer signs on day 12.
- **DELIV-005 — Resend by email or SMS** (missing). Resend by SMS through the provider fake, the signer opens the SMS link and signs; after rotation the old link refuses.
- **DELIV-006 — Correct an envelope in flight** (missing). After signer 1 signs, correct signer 2's email and add a copy recipient; signer 1's signature stands, the old link for signer 2 refuses, and the new one completes the envelope; an attempt to change signer 1's signed field, through the correction screen or the API, is refused; the audit trail shows each correction with its before and after values.
- **DELIV-007 — Completed copies to every party** (partial). Complete an envelope with two signers and a copy recipient; all three receive the completed copy through the mail fake, and secure links require their mailbox code.
- **DELIV-008 — Sender notifications** (missing). A sender subscribed to declines and completions in Slack, Microsoft Teams, Nook and email receives each through the Slack and Teams fakes, a Nook test installation and the mail fake, and nothing else; after unsubscribing from completions in Teams, the next completion reaches the other three channels and not Teams; every notice appears in the in-app activity feed.

### Bulk send and web forms

- **BULK-001 — Bulk send from a spreadsheet** (missing). Upload 500 rows with three invalid emails; the preview marks the three, the sender approves the batch once, the other 497 envelopes send with no further approval and each record names the batch, and the batch shows each envelope's status as they complete; the saved list feeds a second batch with no re-upload.
- **FORM-001 — Public signing web forms** (missing). Open a form link signed out, verify an email and sign; the envelope is sent with no human approval step and its record names the web-form policy; the company signer countersigns; a bot request without a Turnstile token and a submission past the limit are refused.

### Envelope management and reporting

- **MANAGE-001 — Envelope dashboard with search** (partial). With 5,000 envelopes, search by recipient email returns in under one second and each status filter shows the right count.
- **MANAGE-002 — Folders, tags and custom envelope fields** (missing). A template adds a required cost-center field; envelopes are filtered and exported by it and the HubSpot fake receives it.
- **MANAGE-003 — Waiting for me** (missing). An admin is the second signer of a colleague's envelope and signs from the in-app list after the first signer finishes.
- **MANAGE-004 — Reports and exports** (missing). A fixture of 300 envelopes produces the expected counts and median turnaround, and the CSV matches the report.
- **MANAGE-005 — Envelope detail and timeline** (partial). For an envelope with three recipients mid-routing, the detail page at 1440 and 390 pixels shows each recipient's sent, delivered, viewed and signed times matching the provider events (`DELIV-001`) and the audit trail, and its remind action sends one reminder to the current signer only.

### Execution evidence

- **RECORD-002 — Per-recipient certificate evidence** (partial). Complete an envelope with email-code and SMS-code signers and show each item on the certificate matches the audit trail.
- **RECORD-003 — Sealed PDFs** (missing). Open the executed PDF in a PDF validator to show a valid seal; modify one byte and show the seal fails.
- **RECORD-004 — Public verification** (done). A signed-out visitor verifies a genuine executed PDF, an altered copy fails, and an unrelated PDF reveals nothing.
- **RECORD-005 — Retention and legal hold** (missing). With the clock advanced, a seven-year rule purges an envelope after its warning, and a held envelope survives both the rule and an erase request.

### Team administration

- **ADMIN-001 — Roles and envelope sharing** (partial). A sender sends, corrects and voids their own envelope; two senders cannot see each other's envelopes until one shares a folder, and a view-only share lets the other read but not void; a viewer can read but not send; the API enforces the same boundaries.
- **ADMIN-002 — Members, groups and departures** (partial). Deactivate a sender with two in-flight envelopes; transfer them; both complete and notify the new owner.
- **ADMIN-003 — SSO and SCIM** (partial). Through IdP fakes, an OIDC and a SAML sign-in succeed, a SCIM create adds a member and a SCIM deactivate ends their sessions.
- **ADMIN-004 — Account defaults and sending policies** (missing). Change each default and show new envelopes inherit it; a templates-only policy on the Field group refuses an ad hoc upload by its sender while another group's sender can still send ad hoc; a web-form submission sends under the web-form policy and its record names the policy and version; with that policy turned off, the next submission waits for a named person's approval.
- **ADMIN-005 — Account audit log** (missing). Change a template, a role and an integration; the log shows all three with before and after values and exports them.
- **ADMIN-006 — Transparent usage and cost** (missing). With an SMS cap of 5 USD, sending past the cap warns, then stops SMS codes while email codes continue, and the usage page shows the totals.
- **ADMIN-007 — First-day setup and readiness** (partial). In a fresh installation the owner claims it; with a DNS fake missing the DKIM record, the readiness screen shows DKIM failing with the exact record to add and a real send is refused; after the record is added the check passes and the send goes.
- **ADMIN-008 — Custom permission profiles** (missing). A Templates-only profile assigned to the Field group sends from a template but is refused an ad hoc upload in the UI and the API; a Bulk sender profile can bulk send while a plain sender cannot; changing a profile takes effect on the member's next request and is in the account audit log (`ADMIN-005`).
- **ADMIN-009 — Two-factor sign-in for members** (missing). With the requirement on, a member without a factor must enrol before reaching the app; an authenticator-app sign-in succeeds with the right code and fails with a wrong one; a passkey sign-in succeeds through a WebAuthn virtual authenticator; a recovery code works once and then refuses; the policy change is in the account audit log.

### Developer platform

- **API-001 — Public REST API** (partial). A send-scope call creates an envelope already sent, with no approval step, and its record names the key and the policy; a client creates, sends, polls, downloads and voids envelopes using only the published OpenAPI document; a repeated idempotency key returns the first result; a key without the send scope is refused.
- **API-002 — Signed webhooks with retries** (missing). A receiver fake fails twice then succeeds; the log shows three attempts; a replay delivers the same event ID; a tampered signature is rejected by the documented verification.
- **API-003 — Embedded signing and sending** (missing). A test page on an allowed origin embeds signing and receives the signed event; an unlisted origin is refused; embedded preparing creates and sends an envelope.
- **API-004 — SDKs and test mode** (missing). The SDK examples run against a test-mode key; test envelopes are watermarked and absent from production reports and webhooks.

### Integrations

- **INTEG-001 — HubSpot** (missing). Through a HubSpot fake, send from a deal, complete it and show the deal's properties, timeline event and attached PDF updated once.
- **INTEG-002 — Salesforce** (missing). Through a Salesforce fake, send from an Opportunity, complete it and show field write-back and the attached file.
- **INTEG-003 — Orbit** (missing). Through Orbit's API in a test installation, send from a deal and show the completed record on it.
- **INTEG-004 — Google Workspace** (missing). Through a Google fake, send a Drive document and show the completed PDF and certificate in the configured folder; pick a Google Doc and show it arrives as a converted PDF whose fingerprint the envelope binds; in the Gmail add-on test harness, open a message with a PDF attachment from a client with one person on Cc, see the attachment and both participants proposed as recipients, and send; from another message, sign the attached PDF yourself with no mail sent to you.
- **INTEG-005 — Microsoft 365** (missing). Through a Microsoft Graph fake, send a OneDrive document and show the completed record filed in the SharePoint folder; in the Outlook add-in test harness, open a message with a PDF attachment and two participants, see the attachment and both participants proposed as recipients, and send; sign another message's attachment yourself with no mail sent to you; in the Word add-in test harness, send the open document and show the envelope binds the converted PDF's fingerprint.
- **INTEG-006 — Box and Dropbox** (missing). Through Box and Dropbox fakes, a completion files the PDF and certificate once each, and a retry does not duplicate.
- **INTEG-007 — Chest** (missing). In a test installation of Chest, a completion appears in the configured Chest folder with its fingerprint.
- **INTEG-008 — Locket handoff** (partial). A Locket-initiated envelope completes and Locket shows the executed record against the approved revision; a downloaded handoff manifest still verifies offline.
- **INTEG-009 — Zapier, Make, Power Automate, n8n and Crank** (missing). Each app's test harness triggers on a completion and sends from a template.
- **INTEG-010 — Payment at signing through Stripe** (missing). In Stripe test mode, a signer pays a 500 USD deposit and the envelope completes with the payment reference; a declined card leaves the envelope waiting with the signature unsaved.
- **INTEG-011 — Signing service for sibling products** (missing). A Lodge-style client sends an offer letter from a template with no approval step, the record names its key and the policy, and the client receives the completion webhook and executed PDF.

### Mobile

- **MOBILE-001 — Responsive sending and tracking** (partial). At 390 pixels, send from a template, remind a signer and void an envelope.
- **MOBILE-002 — Native iOS and Android apps** (missing). On iOS and Android simulators, sign a received envelope with a drawn signature using guided Next; send from a template, track its recipients and send a reminder; scan a two-page document and send it; and receive a push notification on each signature and on completion.

### Migration and portability

- **MOVE-002 — Docusign move-in** (missing). Through a Docusign API fake with two senders, 50 envelopes, five templates in a shared folder, two signing groups and 120 contacts, preview and import; each sender sees only their own imported envelopes in the UI and API while an admin sees all; the shared folder's settings carry over, so a member with use access can send from a template but not edit it; an imported signing group sends as one recipient; contacts autocomplete; a third Docusign user with no member is on the unmapped list and their envelopes belong to the named admin; open an imported certificate and send from an imported template; the unmapped list names each skipped field type; the fake's PowerForm arrives as a web form whose page and the cutover checklist show the old PowerForm URL beside the new link, and a signed-out submission to the new link sends an envelope; the fake's brand, custom disclosure, default reminder and expiry settings and a saved bulk-send list arrive, and the next envelope and bulk batch use them.
- **MOVE-003 — Adobe Acrobat Sign move-in** (missing). Through an Acrobat Sign API fake with two senders, import agreements and a library template, show each sender owns only their own agreements, and send from the template.
- **MOVE-004 — Dropbox Sign move-in** (missing). Through a Dropbox Sign API fake with two senders, import requests and templates, show each sender owns only their own requests, and send from one.
- **MOVE-005 — Documenso move-in** (missing). Through a Documenso fake with two senders, import documents and a template, show each sender owns only their own documents, and send from it.
- **MOVE-006 — Cutover of in-flight envelopes** (missing). A fake with two in-flight envelopes; one completes after cutover and is imported under its sender, the other is voided upstream and is listed as voided; the fake's call log shows neither envelope polled twice within 15 minutes.
- **MOVE-007 — API compatibility for common calls** (missing). A client written against the incumbent's documented requests runs unchanged against the compatibility layer for create, create-and-send, status, download and void; a listener written for Docusign Connect receives a Connect-shaped completion message (envelope and recipient statuses, and the documents when configured) whose HMAC signature header its existing verification accepts; a listener written for Dropbox Sign callbacks receives a callback-shaped signature-request-all-signed event and accepts it the same way.
- **MOVE-008 — Throttled, resumable imports at account size** (partial). A Docusign fake with 18,000 envelopes and a 3,000-call hourly limit, with the clock advanced: the import returns the hourly-limit error mid-import, pauses, resumes after the window and finishes; the job is killed mid-batch and resumed, and exactly 18,000 envelopes exist with no duplicates; the fake's call log shows no hour over the limit and no resource polled twice within 15 minutes.
- **PORT-002 — Self-service export at any size** (partial). Export 2 GB of envelopes, interrupt and resume, and restore into an empty installation with every fingerprint verified.

### Compliance profiles

- **COMPLY-001 — 21 CFR Part 11 signing profile** (missing). With the profile on, a signer re-authenticates and picks a reason; the executed PDF shows the manifestation; the validation package for the installed version contains IQ, OQ and PQ scripts with executed results, and every traceability-matrix row cites a test that passed in that run.
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
