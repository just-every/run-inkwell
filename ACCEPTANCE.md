<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Inkwell installation

The primary journey: Move templates and records in, prepare the agreement, route and authenticate its parties, sign, chase delivery, verify completion and file the record in the business’s connected systems.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 17 | 108 | 19 | 144 |
| Agent surface | 0 | 0 | 13 | 13 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 17 | 108 | 32 | 157 |

Judged from the code and tests at commit `f5dab1a4491a157fdf3370f0b5d53b18af9dfd66` (27 October 2026). Field proof register: 11 rows; 0 passed, 0 failed, 11 not run.

## Core

### Routing and access

#### HTTP-001 — Health, API and document routing

Core · published · **done** · Cites BASE-OPS-001

**Requirement.** Application documents, product API requests and unknown routes reach the intended public door, with deployment identity available to the operator. The [detailed record rules](docs/contract/record-rules.md#http-001) apply.

**Acceptance.**
1. the built Worker answers `/health` with its deployment fingerprint, source and version, serves the application document, and returns 404 for unknown routes.

**Evidence.** `tests/runtime.mjs`, `src/inkwell/api.ts`
**Gap.** None.

#### ACCESS-001 — Server-side roles and scoped authority

Core · published · **partial** · Cites BASE-ACCESS-002, BASE-ROLE-001

**Requirement.** Inkwell’s sender may manage envelopes they created or hold an edit share on, and read view-shared envelopes; viewers read only. Owners and admins hold envelope-management authority, while chosen private-thread audiences remain separate. Restored member identities start as viewers. The role matrix also governs folders, groups, permission profiles, corrections and scoped integration credentials. The [detailed record rules](docs/contract/record-rules.md#access-001) apply.

**Acceptance.**
1. signed-out, viewer, sender, admin, owner and agent-token requests to every document, import, agent and archive door return the allow or refuse that `ADMIN-001`'s matrix documents; a sender-role member prepares, sends and voids their own envelope and is refused on another sender's unshared envelope; a cross-origin change is refused.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/api.ts`, `src/inkwell/members.ts`, `src/inkwell/storage.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Signed-out, viewer, sender, admin, owner and agent-token authority agrees with the declared matrix at every document, import, agent and archive door.; The sender prepares, sends and voids their own envelope.; Another sender’s unshared envelope is refused.; Cross-origin changes are refused..

### Sending and signing

#### SEND-001 — Prepare a fixed envelope and authorize sending

Core · published · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A sender prepares an envelope whose documents are bound by their SHA-256 fingerprints, with recipients, routing order and fields (`PREP-*`, `ROUTE-001`). Every send has a named authority, recorded on the envelope. The [detailed record rules](docs/contract/record-rules.md#send-001) apply.

**Acceptance.**
1. prepare an envelope through the API; an ad hoc approval without the eligibility confirmation is refused and one with it sends; a `FORM-001` submission and an `API-001` send-scope call each produce a sent envelope with no human approval step, and each record names the sending policy and credential that allowed it; with the policy for API sends turned off, the same call is refused; after signer 1 signs, a `DELIV-006` correction of signer 2's email succeeds and is audited, while any change to signer 1's signed field, direct or through a correction, is refused.
2. preparation freezes the bytes and sending definition at the pinned template version.
3. Each eligibility confirmation records that template ID, pinned version and then-live revision, including its approval rule and sending-policy version.
4. Every immediate release, scheduled dispatch and last ROUTE-004 approval fences that live revision in the invitation batch.
5. Any intervening edit, new version, rule or sending-policy change, disablement or deletion holds the draft and revokes unused signing links; restoring an earlier state never releases it.

**Evidence.** `tests/api.test.mjs`, `tests/web-forms.test.mjs`, `tests/api-keys.test.mjs`, `tests/journeys/forms.mjs`, `tests/journeys/internal-approval.mjs`, `tests/send-policies.test.mjs`, `tests/journeys/template-release.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: prepare an envelope through the API; an ad hoc approval without the eligibility confirmation is refused and one with it sends; a `FORM-001` submission; an `API-001` send-scope call each produce a sent envelope with no human approval step; each record names the sending policy and credential that allowed it; with the policy for API sends turned off, the same call is refused; after signer 1 signs, a `DELIV-006` correction of signer 2's email succeeds and is audited, while any change to signer 1's signed field, direct or through a correction, is refused; preparation freezes the bytes and sending definition at the pinned template version; Each eligibility confirmation records that template ID, pinned version and then-live revision, including its approval rule and sending-policy version; Every immediate release, scheduled dispatch and last ROUTE-004 approval fences that live revision in the invitation batch; Any intervening edit, new version, rule or sending-policy change, disablement or deletion holds the draft and revokes unused signing links; restoring an earlier state never releases it.

#### SEND-003 — Frozen-template confirmation and recovery

Core · published · **partial** · From SEND-001 · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** This capability governs frozen-template confirmation and recovery. The [detailed record rules](docs/contract/record-rules.md#send-001) apply.

**Acceptance.**
1. A current editor's fresh confirmation may release the unchanged older frozen definition and bytes, recording the new confirmer and time and re-snapshotting the live revision; it never adopts newer template content.
2. Preparing a newer definition requires a new draft version and confirmation.
3. Deletion keeps the frozen approval rule and never changes a sent envelope.

**Evidence.** `tests/api.test.mjs`, `tests/web-forms.test.mjs`, `tests/api-keys.test.mjs`, `tests/journeys/forms.mjs`, `tests/journeys/internal-approval.mjs`, `tests/send-policies.test.mjs`, `tests/journeys/template-release.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A current editor's fresh confirmation may release the unchanged older frozen definition and bytes, recording the new confirmer and time and re-snapshotting the live revision; it never adopts newer template content; Preparing a newer definition requires a new draft version and confirmation; Deletion keeps the frozen approval rule and never changes a sent envelope.

#### SIGN-001 — Authenticated, consented signing in routing order

Core · published · **partial** · Cites BASE-ROLE-001 · Rules D-1

**Requirement.** Each recipient opens their own single-use link and passes the authentication method the sender chose for them (`IDV-001`): none (the link alone), email code, access code, SMS code, knowledge-based or phone authentication, or identity verification. A signed-in member signing in the app is authenticated by their session (`ROUTE-009`, `MANAGE-003`). The [detailed record rules](docs/contract/record-rules.md#sign-001) apply.

**Acceptance.**
1. two email-code signers verify codes, reject a wrong code, cannot sign out of turn, consent and sign in order, and the second invitation arrives only after the first signature; a link-only recipient signs with no code; two order-1 signers are invited together and sign in parallel, and order 2 is invited only after both have signed.

**Evidence.** `tests/api.test.mjs`, `tests/manual-invitations.test.mjs`, `src/inkwell/signing.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Two email-code signers verify their codes.; A wrong code is refused.; Signing out of turn is refused..

#### SEND-002 — Void an unfinished envelope

Core · published · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** The envelope's sender, anyone it is shared with for editing, or an admin (`ADMIN-001`) voids a sent or partially signed envelope with a reason; outstanding links, codes and signer sessions stop working immediately and pending mail is canceled. Owners, admins, the sender who created the envelope and anyone it is shared with to edit (`ADMIN-001`) void it. The [detailed record rules](docs/contract/record-rules.md#send-002) apply.

**Acceptance.**
1. a sender-role member voids their own envelope after sending and is refused on another sender's unshared envelope; the voided envelope's invitation link refuses and the pending message is canceled.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/envelopes.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Another sender’s unshared envelope is refused and unchanged..

#### DELEGATE-001 — Scoped preparation credentials

Core · published · **partial** · Cites BASE-AGENT-004, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** A preparation credential grants only envelope preparation. Sending and signing use separate capabilities carrying external and commitment, respectively; the company’s risk policy decides an agent’s calls. Human attribution is reserved for the person’s own action. The [detailed record rules](docs/contract/record-rules.md#delegate-001) apply.

**Acceptance.**
1. A preparation-only token prepares an envelope and refuses actions outside its grant: sending, signing and reading archives.
2. Revoking that preparation token prevents its next use.
3. Under the held company policy, a person releases the prepared envelope; its audit trail identifies the agent as preparer and that person as approver.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/agents.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A preparation-only token prepares an envelope and refuses actions outside its grant: sending, signing and reading archives; Revoking that preparation token prevents its next use; Under the held company policy, a person releases the prepared envelope; its audit trail identifies the agent as preparer and that person as approver.

### Execution records

#### RECORD-001 — Executed PDF, certificate and verifiable audit trail

Core · published · **partial** · Cites BASE-AUDIT-001, BASE-DATA-006

**Requirement.** On the last signature Inkwell produces the executed PDF with the signed values, a completion certificate and a hash-chained audit trail; the sender downloads the original, executed PDF, certificate, audit JSON and a handoff manifest, and verification recomputes every fingerprint and the event chain. Signers download the executed PDF and certificate after completion. The [detailed record rules](docs/contract/record-rules.md#record-001) apply.

**Acceptance.**
1. complete an envelope, download every artifact, and show recomputed document and audit fingerprints agree with the stored values and the handoff manifest.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/pdf.ts`, `src/inkwell/envelopes.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Completion produces every downloadable artifact.; The audit event chain is independently recomputed.; The handoff manifest reconciles every fingerprint with the downloaded artifacts..

### Moving in, backup and erasure

#### MOVE-001 — DocuSeal archive move-in

Core · published · **partial** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** The owner previews a DocuSeal completed-submission archive without writes, approves its fingerprint, imports signed PDFs and provider evidence with their provider provenance, reads the durable import journal, downloads imported artifacts and undoes the import. The [detailed record rules](docs/contract/record-rules.md#move-001) apply.

**Acceptance.**
1. dry run, fingerprint approval, import, journal, downloads and undo of the DocuSeal fixture, with custody preserved at every step.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/imports/index.ts`, `tests/fixtures/docuseal/archive.json`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: An incorrect fingerprint refuses import.; The import records preserve provider custody.; Every import journal entry and its fields reconcile throughout preview, apply and undo..

#### PORT-001 — Whole-installation export and restore

Core · published · **partial** · Cites BASE-DATA-001, BASE-BACKUP-001

**Requirement.** A checksum-bound installation archive includes Inkwell envelopes, execution artifacts and durable import journals. Document-specific custody survives a fresh installation without reviving active credentials. The [detailed record rules](docs/contract/record-rules.md#port-001) apply.

**Acceptance.**
1. export validates its contents, a populated installation refuses restore, and a fresh installation restores the executed file, certificate and full import journal.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/archive.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The full import journal reconciles every entry and field after restore..

#### ERASE-001 — Erasure with a restore fence

Core · published · **partial** · Cites BASE-DATA-003, BASE-DATA-006

**Requirement.** Inkwell’s erasure journal prevents an older archive from resurrecting erased voided, expired or completed native envelopes. Record-specific legal hold and retention govern eligibility. The [detailed record rules](docs/contract/record-rules.md#erase-001) apply.

**Acceptance.**
1. erase an envelope, show its files and identity custody are gone, and show a fresh-store restore with the later journal refuses resurrection while restoring everything else.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/archive.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Erased identity custody is absent from all records..

### Documents and fields

#### PREP-001 — PDF and Word uploads at business size

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A sender uploads PDF, DOCX, DOC, RTF, TXT, PNG and JPEG sources up to 25 MB each; non-PDF files are converted to PDF by an isolated conversion service before preparation, and the converted PDF is what every signer sees and what the envelope's fingerprint binds. Encrypted, corrupt or unsupported files are refused with a reason. The [detailed record rules](docs/contract/record-rules.md#prep-001) apply.

**Acceptance.**
1. upload a 20 MB PDF, a DOCX with tables and images, and a phone photo of a page; each converts, previews and signs with a fingerprint over the converted PDF; an encrypted PDF and a 30 MB file are refused with their reasons; a DOCX with text tags prepares with no manual placement (`PREP-007`).

**Evidence.** `src/inkwell/documents.ts`, `src/inkwell/pdf.ts`, `tests/supplements.test.mjs`, `tests/journeys/document-fields.mjs`
**Gap.** Native PDF slice: a real 20 MB image-bearing PDF is inspected, prepared, previewed and signed with verified fingerprints; copies and template reuse preserve its bytes independently of source erasure; holds refuse erasure. The server enforces 25 MB per source, including staged reads, and refuses encrypted, corrupt and 30 MB uploads with reasons; browser proof covers preparation, refusal and signing at 1440 and 390. Remaining: files still use D1 rows rather than object storage; complete object custody through artifact identity, templates, streamed export, multipart restore and erasure remains unbuilt. Isolated DOCX, DOC, RTF, TXT, PNG and JPEG conversion remains unbuilt; no authenticated converter endpoint or deployment provision is supplied. Converted Word template matching and text-tag journeys remain unproved. The small inline base64 transport remains bounded to 2 MiB.

#### PREP-002 — Multi-document envelopes

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** One envelope holds up to 20 documents and 100 MiB in total, in an order the sender sets; fields reference a document and page, signers sign all of them in one session, and the executed record keeps each document separately and as one combined PDF. A document can be marked optional to sign or view-only. The [detailed record rules](docs/contract/record-rules.md#prep-002) apply.

**Acceptance.**
1. send an envelope with a service agreement, a W-9 and a view-only policy; two signers complete it in one session each; the record contains three executed documents, a combined PDF and one certificate covering all three fingerprints.

**Evidence.** `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`, `tests/journeys/document-capacity.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: send an envelope with a service agreement, a W-9; a view-only policy; two signers complete it in one session each; the record contains three executed documents, a combined PDF and one certificate covering all three fingerprints.

#### PREP-003 — The complete field set with validation

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Fields include signature, initials, date signed (filled automatically in the signer's US time zone), full name, email, company, title, text, number, checkbox, checkbox group with minimum and maximum, radio group, dropdown, attachment upload, stamp, and a note; each can be required or optional, read-only or editable, and validated by pattern (US phone, ZIP, SSN or EIN masked on display, email, currency in USD, date format). Each business-data field type added here inherits PREP-008’s prefill, reported source and read-only obligations before it ships. The [detailed record rules](docs/contract/record-rules.md#prep-003) apply.

**Acceptance.**
1. a template with every field type is signed on desktop and phone; invalid ZIP, phone and EIN values are refused with field-level messages; attachments land in the record; masked values are hidden in the dashboard but present in the executed PDF; a signer adopts drawn initials and they appear in every initials field of the executed PDF, with the method on the certificate.
2. Initials fields carry `SIGNX-002`'s obligation: before they ship, the signer adopts initials by typing, drawing or uploading them, the adopted initials go on every initials field, and the record and certificate keep the method.
3. Every new field type joins `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before it ships.
4. Date signed is generated from the server signing instant in the signer-selected US zone (Eastern, Central, Mountain, Arizona, Pacific, Alaska or Hawaii); sender prefill and caller-supplied dates cannot replace it.
5. Business-data fields accept PREP-008 prefill and reported sources with server-enforced read-only values; signatures, initials and generated dates are not business-data prefills.

**Evidence.** `src/inkwell/business-fields.ts`, `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/ui/field-choices-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/prefill.test.mjs`, `tests/journeys/field-types.mjs`, `tests/journeys/template-maintenance.mjs`
**Gap.** Round A: initials (typed/drawn/uploaded, independently adopted, saved for members), automatic date signed in a chosen US zone, full name/email/company/title, pattern validation and masked display; business-data prefill/source/read-only, public-door API proof and 1440/390 scan/keyboard/accessibility-tree journey. Round B slice: radio/dropdown exact options, checkbox group inclusive minimum/maximum, notes and uploaded PNG/JPEG stamps, with source/prefill/read-only enforcement, executed PDF, copy/template/restore custody and 1440/390 keyboard/accessibility-tree/light-dark scans (PREP-003 in the same tests). R23 stamp slice: signing audit SHA-256/type/bytes/supplier, honest certificate lines and staged restore recomputation (src/inkwell/stamp-evidence.mjs, PREP-003 tests). Gap: attachments unshipped; 25 MB target awaits PREP-001 object storage and full ct-approved attachment custody/access/refusal/retention acceptance

#### PREP-013 — Business-field choices and saved values

Core · target · **partial** · From PREP-003 · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** This capability governs business-field choices and saved values. The [detailed record rules](docs/contract/record-rules.md#prep-003) apply.

**Acceptance.**
1. Validation checks syntax, not identity or tax registration: ZIP is five digits with an optional four-digit suffix, US phone is ten digits with an optional country code 1 and conventional separators, SSN is nine digits or XXX-XX-XXXX, EIN is nine digits or XX-XXXXXXX, email needs a local part and dotted domain, and dates are real YYYY-MM-DD calendar dates.
2. SSN and EIN displays are always masked; other business fields may be masked by the sender.
3. Masking changes field display on preparation/signing overlays and dashboard values, not the executed PDF or the existing authorized audit downloads.
4. Initials are adopted separately from a signature and the same initials and mark apply to every filled initials field; a signed-in member's saved initials are offered on subsequent in-app signing, outside archives like their saved signature.
5. Radio and dropdown values are one of the sender's exact option labels.
6. An answered group meets both bounds; a required group also needs at least one selection, while an optional group may be left blank.
7. Notes use the existing single-line text value and optional validation/masking.
8. Each of these four types accepts sender/API prefill with a reported source and a server-enforced read-only setting, survives templates, copies and archive restore, and joins PREP-003's desktop/phone keyboard, accessibility-tree and light/dark scan journey.

**Evidence.** `src/inkwell/business-fields.ts`, `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/ui/field-choices-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/prefill.test.mjs`, `tests/journeys/field-types.mjs`, `tests/journeys/template-maintenance.mjs`
**Gap.** Round A: initials (typed/drawn/uploaded, independently adopted, saved for members), automatic date signed in a chosen US zone, full name/email/company/title, pattern validation and masked display; business-data prefill/source/read-only, public-door API proof and 1440/390 scan/keyboard/accessibility-tree journey. Round B slice: radio/dropdown exact options, checkbox group inclusive minimum/maximum, notes and uploaded PNG/JPEG stamps, with source/prefill/read-only enforcement, executed PDF, copy/template/restore custody and 1440/390 keyboard/accessibility-tree/light-dark scans (PREP-003 in the same tests). R23 stamp slice: signing audit SHA-256/type/bytes/supplier, honest certificate lines and staged restore recomputation (src/inkwell/stamp-evidence.mjs, PREP-003 tests). Gap: attachments unshipped; 25 MB target awaits PREP-001 object storage and full ct-approved attachment custody/access/refusal/retention acceptance

#### PREP-014 — Image stamp evidence

Core · target · **partial** · From PREP-003 · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** This capability governs image stamp evidence. The [detailed record rules](docs/contract/record-rules.md#prep-003) apply.

**Acceptance.**
1. Stamps accept sender/API prefill with a reported source and a read-only flag; the API value is a data URL containing the image bytes, kept with the field values through copies, templates and archives, protected and erased with the envelope.
2. The executed PDF scales the image to fit its field without changing its proportions.
3. Signing and preparation show an image preview unless masked; the dashboard shows an uploaded-image label, never its encoded bytes.
4. A stamp is a supplied image, not a verified seal.
5. The signing audit records each filled stamp's SHA-256, verified PNG/JPEG type, byte count and supplier: signer upload, or sender/API prefill with its reported source and read-only flag.
6. An image equal to its prepared prefill retains that reported supplier, even when the signer submits the same bytes again.
7. Archive staging recomputes the image evidence and checks it against the signing audit; legacy signed stamps without separate evidence retain their original records and are checked against the signing event's existing values fingerprint.

**Evidence.** `src/inkwell/business-fields.ts`, `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/ui/field-choices-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/prefill.test.mjs`, `tests/journeys/field-types.mjs`, `tests/journeys/template-maintenance.mjs`
**Gap.** Round A: initials (typed/drawn/uploaded, independently adopted, saved for members), automatic date signed in a chosen US zone, full name/email/company/title, pattern validation and masked display; business-data prefill/source/read-only, public-door API proof and 1440/390 scan/keyboard/accessibility-tree journey. Round B slice: radio/dropdown exact options, checkbox group inclusive minimum/maximum, notes and uploaded PNG/JPEG stamps, with source/prefill/read-only enforcement, executed PDF, copy/template/restore custody and 1440/390 keyboard/accessibility-tree/light-dark scans (PREP-003 in the same tests). R23 stamp slice: signing audit SHA-256/type/bytes/supplier, honest certificate lines and staged restore recomputation (src/inkwell/stamp-evidence.mjs, PREP-003 tests). Gap: attachments unshipped; 25 MB target awaits PREP-001 object storage and full ct-approved attachment custody/access/refusal/retention acceptance

#### PREP-015 — Signer-uploaded attachment custody

Core · target · **missing** · From PREP-003 · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A signer attaches the permitted source files to their assigned field with uploader-only unsigned custody and immutable signed evidence. Attachment display, fingerprints, record-holder access and retention follow the [detailed attachment rules](docs/contract/record-rules.md#prep-003). Wider recipient sharing follows ROUTE-012 and ROUTE-016; malware scanning is not claimed. The attachment door joins signing guidance, field placement and the shared accessibility journey.

**Acceptance.**
1. The attachment target is one parsed PDF, PNG or JPEG per field, at most 20 fields and 100,000,000 bytes per envelope, with 25,000,000 bytes per file in PREP-001 object storage.
2. Shipping that target requires 20 MB JPEG/PDF success, 30 MB refusal, SHA-256 on read and restore, and legal hold, purge, erasure and restore-fence proof.
3. Attachments are never mailed or displayed except an uploader's PNG/JPEG preview before signing; downloads use the verified type and `<label>-<sha8>.<ext>` filename with "Uploaded by the signer · not scanned or opened by Inkwell".
4. Files belong only to the uploader's place and ACCESS-001 record holders; other recipients receive fingerprint lines with type, byte count, SHA-256 and "not verified", with no filename.

**Evidence.** `src/inkwell/business-fields.ts`, `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/ui/field-choices-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/prefill.test.mjs`, `tests/journeys/field-types.mjs`, `tests/journeys/template-maintenance.mjs`
**Gap.** No attachment field or upload door is delivered. The complete 25 MB attachment, large-file, validation and record-custody journeys remain unasserted.

#### PREP-004 — Conditional and calculated fields

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A field can be shown, required or hidden based on another field's value (for example, "Other" reveals a text field), and a number field can be calculated from others (totals in USD). Hidden fields are never required and never printed. The [detailed record rules](docs/contract/record-rules.md#prep-004) apply.

**Acceptance.**
1. a signer checks a box that reveals two required fields, then unchecks it and finishes without them; a calculated total updates live and prints in the executed PDF.

**Evidence.** `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/inkwell/signing.ts`, `src/ui/field-rules-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/api.test.mjs`, `tests/journeys/conditional-fields.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The checked box reveals two required fields.; Unchecking permits completion with both fields absent.; The calculated total updates live..

#### PREP-005 — Direct field placement and editing

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** The sender places fields by click or drag on page thumbnails and the full page, resizes, duplicates, aligns and moves them between signers, assigns them by color, and sets each field's properties; keyboard users place and move fields with arrow keys. The [detailed record rules](docs/contract/record-rules.md#prep-005) apply.

**Acceptance.**
1. at 1440 and 390 pixels, place twelve fields across three pages by pointer and by keyboard, duplicate one to every page, reassign two to another signer, and save without losing a field.
2. Drag, resize, duplicate, align and reassign join `SIGNX-003`'s accessibility scan and keyboard-only journey (with a keyboard way to do each) before they ship.

**Evidence.** `tests/journeys/field-placement.mjs`, `tests/journeys/a11y.mjs`, `src/ui/field-editor.tsx`, `src/ui/editable-field.tsx`, `src/ui/field-inspector.tsx`, `src/ui/field-layout.ts`, `src/ui/page-thumbnails.tsx`, `src/ui/pdf-viewer.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Duplicating to every page preserves positions..

#### PREP-006 — AI field and recipient detection

Core · target · **missing** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** On upload, Inkwell identifies signature lines, dates, name and title blocks, checkboxes, repeated initials and recipients from headings, email addresses and the email thread. Each reading carries confidence and provenance. Field changes carry standard and outside model processing carries external, adding sensitive for regulated fields; the company’s risk policy decides whether readings are applied or held for an editor. The [provider and disclosure rules](docs/contract/record-rules.md#prep-006) apply.

**Acceptance.**
1. upload the unmarked two-party service agreement fixture, whose two signature lines, two date lines and two printed-name lines sit at recorded page coordinates; all six are proposed, each on the right page and party, with its center within 12 points (one sixth of an inch) of the recorded position and its width and height within 25% of the recorded box; no signature field is proposed away from a recorded position; the sender rejects one, accepts the rest and the envelope records which fields came from detection.

**Evidence.** None.
**Gap.** No AI field or recipient detection

#### PREP-007 — Text tags and existing PDF form fields

Core · target · **done** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Text tags in the document (for example `{{signature:1}}` or Docusign-style anchor strings) and existing AcroForm fields become Inkwell fields automatically, with their names kept for API prefill. The [detailed record rules](docs/contract/record-rules.md#prep-007) apply. `PREP-001`'s acceptance adds a DOCX with text tags before Word uploads ship.

**Acceptance.**
1. a PDF with text tags and a fillable IRS W-9 PDF both prepare with no manual placement, and the W-9's named fields prefill through the API.

**Evidence.** `src/inkwell/document-fields.ts`, `src/inkwell/pdf-layout.ts`, `src/inkwell/drafts.ts`, `src/inkwell/pdf.ts`, `src/ui/prepare-envelope.tsx`, `tests/document-fields.test.mjs`, `tests/journeys/document-fields.mjs`, `tests/fixtures/fw9.pdf`
**Gap.** None.

#### PREP-008 — Prefill from business data

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Fields can be filled by the sender before sending or from an API payload, editable by the signer or locked as read-only; each prefilled value records its reported source. Today this covers text, date, checkbox and USD number fields. The [detailed record rules](docs/contract/record-rules.md#prep-008) apply.

**Acceptance.**
1. send from a template with a HubSpot-fake deal supplied as the API payload; company, address and amount prefill with their reported source in the record, and the signer cannot change the locked amount.

**Evidence.** `tests/prefill.test.mjs`, `tests/journeys/prefill.mjs`, `src/inkwell/prefill.ts`, `src/ui/field-prefill-editor.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The template accepts a HubSpot-fake deal supplied as API prefill..

#### PREP-009 — Messages, drafts and scheduled sending

Core · target · **done** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** The sender sets the email subject and message for the envelope and a private message per recipient, saves a draft and returns to it, and schedules sending for a future date and time in a US time zone. A draft is a prepared envelope before approval; reopened, everything in it can be changed and saved again (its PDF, title, recipients and routing order, access codes, fields, expiry, reminders, copy recipients, the paper option, the subject, the message and each private message), keeping its ID, sender and audit trail, and the record names every saved version. The [detailed record rules](docs/contract/record-rules.md#prep-009) apply.

**Acceptance.**
1. save a draft, reopen it, add private messages, schedule it for the next business day at 9:00 America/Chicago and show it sends then with each recipient seeing only their own private message.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/drafts.ts`, `src/inkwell/schedule.ts`, `src/inkwell/mail.ts`, `src/ui/prepare-envelope.tsx`
**Gap.** None.

#### PREP-010 — Copy an envelope

Core · target · **done** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** From any sent, completed, declined, voided or expired envelope the sender can see, Copy creates a new draft with the same documents (the original, unsigned bytes), recipients, fields, messages and settings, without any entered values or signatures; the new envelope records the envelope it was copied from. The [detailed record rules](docs/contract/record-rules.md#prep-010) apply.

**Acceptance.**
1. copy a completed envelope; the draft has the unsigned documents, the same recipients and fields and no signed values; send it, and its record names the source envelope.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/envelopes.ts`, `src/ui/envelope-detail.tsx`
**Gap.** None.

#### PREP-011 — Free-form signing

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** When the account's free-form setting (`ADMIN-004`) is on, a sender sends documents with no placed fields; each signer then places their own signature, initials, date signed, full name and single-line text fields wherever they choose, must place at least one signature before finishing, and the record and certificate mark the envelope as free-form and list the fields each signer placed. The setting is account-wide, off by default, and only an active owner or admin changes it, fenced with their role in the same write; each change is recorded append-only with actor, time, before and after value and the new setting version, and appears in `ADMIN-005`'s log when that ships. The [detailed record rules](docs/contract/record-rules.md#prep-011) apply.

**Acceptance.**
1. send a one-page letter with no fields to one signer; the signer places a signature and a date on page 1 and finishes, and the executed PDF shows both at the places chosen; finishing with no signature placed is refused; with the setting off, sending without fields is refused in the UI and API.

**Evidence.** `tests/freeform-fields.test.mjs`, `tests/freeform-policy.test.mjs`, `tests/journeys/freeform-settings.mjs`, `tests/journeys/freeform.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: send a one-page letter with no fields to one signer; the signer places a signature; a date on page 1 and finishes; the executed PDF shows both at the places chosen; finishing with no signature placed is refused; with the setting off, sending without fields is refused in the UI and API.

#### PREP-012 — Document generation from Word templates

Core · target · **missing** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A template's DOCX can carry merge fields, repeating table rows (for example line items with quantities and USD amounts) and conditional sections. At send time Inkwell fills them from sender input, a CRM record (`PREP-008`) or the API payload, converts the result to PDF (`PREP-001`) and fingerprints the generated document; the sender previews it before sending, and a missing required merge value stops the send with its name. The [detailed record rules](docs/contract/record-rules.md#prep-012) apply.

**Acceptance.**
1. through the API, generate from a DOCX template with a client-name merge field, a line-item table fed three rows with a calculated USD total, and a section included only when a payload flag is true; the preview and the executed PDF show the name, three rows, the total and the section, and a second send with the flag false omits the section; a payload missing the client name is refused before sending, naming the field.

**Evidence.** None.
**Gap.** No DOCX templates, merge fields, repeating tables or conditional sections

### Templates

#### TMPL-001 — Reusable templates with saved roles

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A template holds documents, fields, roles (for example Client and Company Signer) with routing order, messages, reminders, expiry and identity settings; sending from it asks only for each role's name and email (or a signing group, `ROUTE-005`) and any sender fields. Several templates can be combined in one envelope (`TMPL-004`). The [detailed record rules](docs/contract/record-rules.md#tmpl-001) apply.

**Acceptance.**
1. create a template with three roles, send it twice to different people, and show each envelope inherited fields, routing, reminders and expiry with no placement.

**Evidence.** `tests/api.test.mjs`, `tests/journeys/templates.mjs`, `tests/prefill.test.mjs`
**Gap.** None.

#### TMPL-002 — Shared team templates

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Templates live in personal or shared folders with an owner, can be shared with people or groups to use or to edit, and are searchable by name and tag. The [detailed record rules](docs/contract/record-rules.md#tmpl-002) apply.

**Acceptance.**
1. a member sees and uses a shared template but cannot edit it; an editor changes it; a member without access cannot find it through the UI or API.

**Evidence.** `src/inkwell/template-shares.ts`, `src/inkwell/templates.ts`, `src/ui/templates.tsx`, `src/ui/template-sharing.tsx`, `migrations/core/0029_template_shares.sql`, `tests/api.test.mjs`, `tests/journeys/templates.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A user with use access cannot edit it..

#### TMPL-003 — Template versions that never change sent envelopes

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Editing a template creates a new version; envelopes already sent keep the version they were sent from, and the record names it. A sent envelope can be saved as a new template. The [detailed record rules](docs/contract/record-rules.md#tmpl-003) apply.

**Acceptance.**
1. send from version 1, edit the template, send again; the first envelope still shows version 1 fields and the second version 2; saving the first as a template reproduces its fields and roles.
2. SEND-001 also pins prepared and held envelopes to their older bytes and definition; a template edit requires fresh eligibility confirmation at release, and that confirmation never substitutes the newer template content.

**Evidence.** `src/inkwell/templates.ts`, `src/ui/templates.tsx`, `src/ui/prepare-envelope.tsx`, `src/ui/envelope-detail.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: SEND-001 also pins prepared and held envelopes to their older bytes and definition; a template edit requires fresh eligibility confirmation at release, and that confirmation never substitutes the newer template content.

#### TMPL-004 — Several templates in one envelope

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** A sender applies two or more templates to one envelope in a chosen order, alongside any ad hoc documents (`PREP-002`). Recipients whose role name and routing order match across templates merge into one recipient, and a preview shows the merged recipient list before sending. The [detailed record rules](docs/contract/record-rules.md#tmpl-004) apply.

**Acceptance.**
1. an NDA template (role Client, order 1) and a W-9 template (role Client, order 1) go out as one envelope; the client signs both in one session and the certificate lists both template versions; a third template whose Client role sits at order 2 is shown as a separate recipient in the preview before sending; when the W-9 template requires an SMS code and the NDA an email code, the preview names the conflict and proposes the SMS code.

**Evidence.** `tests/api.test.mjs`, `tests/send-policies.test.mjs`, `tests/journeys/template-composition.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: an NDA template (role Client, order 1); a W-9 template (role Client, order 1) go out as one envelope; the client signs both in one session; the certificate lists both template versions; a third template whose Client role sits at order 2 is shown as a separate recipient in the preview before sending; when the W-9 template requires an SMS code; the NDA an email code, the preview names the conflict and proposes the SMS code.

#### TMPL-005 — Template matching on upload

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** When a sender uploads a document that matches a template's document (by fingerprint or by page-text similarity), Inkwell offers that template's fields and roles, with the match confidence; the sender applies or ignores the offer, and nothing is placed without their choice. The [detailed record rules](docs/contract/record-rules.md#tmpl-005) apply.

**Acceptance.**
1. upload a fresh copy of the W-9 a template uses; the match is offered and applying it places every template field; an unrelated agreement is offered nothing.

**Evidence.** `src/inkwell/template-match.ts`, `src/inkwell/pdf-text.ts`, `src/ui/template-offer.tsx`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Applying the offer places every template field..

### Recipients and routing

#### ROUTE-001 — Any number of recipients and roles

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** An envelope has up to 100 recipients, each with a role: signer, approver (approves without signing), form filler, witness (nominated by the signer they witness, `ROUTE-010`), in-person signer, specify-recipients agent, editor, needs to view (`ROUTE-011`), or receives a copy. Copy recipients receive the completed record and no action link; each recipient sees only their own actions and only the documents visible to them (`ROUTE-012`). The [detailed record rules](docs/contract/record-rules.md#route-001) apply.

**Acceptance.**
1. send to eight signers, one approver, one form filler and three copy recipients, where signer 1 must have a witness; each sees only their own actions; signer 1 nominates a witness who is invited only after signer 1 signs and before order 2; copy recipients receive only the completed record.

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/recipient-roles.mjs`, `tests/journeys/routing.mjs`, `tests/journeys/recipient-capacity.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: send to eight signers, one approver, one form filler and three copy recipients, where signer 1 must have a witness; each sees only their own actions; signer 1 nominates a witness who is invited only after signer 1 signs and before order 2; copy recipients receive only the completed record.

#### ROUTE-002 — Sequential, parallel and mixed order

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** Recipients share or differ in routing order: equal numbers act in parallel, higher numbers wait for all lower ones to finish. A routing order is a whole number from 1 to 100 set per recipient, in any list position and with gaps allowed; a recipient given none takes their list position (1 for the first). The [detailed record rules](docs/contract/record-rules.md#route-002) apply.

**Acceptance.**
1. recipients at orders 1, 2, 2 and 3; both order-2 recipients are invited together after order 1, and order 3 is invited only after both finish.

**Evidence.** `src/inkwell/model.ts`, `src/inkwell/signing.ts`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs`
**Gap.** None.

#### ROUTE-003 — Conditional routing

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A routing rule includes or skips a recipient based on a field value (for example, amounts over 10,000 USD add the finance director). Skipped recipients are recorded with the rule that skipped them. The [detailed record rules](docs/contract/record-rules.md#route-003) apply.

**Acceptance.**
1. two envelopes from one template with amounts of 5,000 and 25,000 USD; only the second routes to the finance director, and the first's certificate names the skipped step and its rule; a copy recipient whose rule is an amount over 10,000 USD gets the completed copy only from the 25,000 envelope, the 5,000 certificate names the skipped copy and its rule, and a copy whose source is missing at completion is sent and recorded as "rule unresolved, copy sent"; the routing preview shows the skip before sending.

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/routing.mjs`, `src/inkwell/routing.ts`, `src/ui/routing-rules.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: two envelopes from one template with amounts of 5,000 and 25,000 USD; only the second routes to the finance director; the first's certificate names the skipped step; its rule; a copy recipient whose rule is an amount over 10,000 USD gets the completed copy only from the 25,000 envelope, the 5,000 certificate names the skipped copy; a copy whose source is missing at completion is sent and recorded as "rule unresolved, copy sent"; the routing preview shows the skip before sending.

#### ROUTE-004 — Internal approval before sending

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A template or account rule can require a named approver to approve an envelope before it goes to external recipients, with approve and reject (with reason) actions and an audit entry for each. The [detailed record rules](docs/contract/record-rules.md#route-004) apply.

**Acceptance.**
1. a sender's envelope above the rule's threshold waits for the approver; a rejection returns it to the sender with the reason; an approval sends it.

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/internal-approval.mjs`, `src/inkwell/internal-approval.ts`, `src/ui/internal-approval.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: An above-threshold envelope waits for its internal approver.; Rejection returns an editable draft with the entered reason.; The final approval sends the envelope..

#### ROUTE-005 — Signing groups

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A recipient can be a signing group; any one member signs for it, and the record names who did. The [detailed record rules](docs/contract/record-rules.md#route-005) apply.

**Acceptance.**
1. send to the "Company Signers" group of three; one member signs, the others' links show it is done, and the certificate names the signer and the group.

**Evidence.** `src/inkwell/signing-groups.ts`, `src/inkwell/signing.ts`, `src/inkwell/certificate.ts`, `src/ui/signing-groups.tsx`, `tests/routing.test.mjs`, `tests/journeys/signing-groups.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A three-member signing group occupies one place.; One member completes that group place.; The remaining links show completion and refuse further signing.; The certificate names the actual signer.; The certificate names the group..

#### ROUTE-006 — Delegation and reassignment

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** When the sender allows it, a recipient reassigns their action to someone else with a reason; the sender can also replace an unsigned recipient (a `DELIV-006` correction). The original recipient's link stops working and the record shows both people. The [detailed record rules](docs/contract/record-rules.md#route-006) apply.

**Acceptance.**
1. a signer reassigns to a colleague; the colleague verifies and signs; the original link refuses; a disallowed reassignment is refused.

**Evidence.** `src/inkwell/reassign.ts`, `src/ui/signer-app.tsx`, `src/ui/prepare-envelope.tsx`, `tests/delivery.test.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: a signer reassigns to a colleague; the colleague verifies and signs; the original link refuses; a disallowed reassignment is refused.

#### ROUTE-007 — Hosted in-person signing

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A team member hosts an in-person signer on their own device or a tablet; the signer’s identity is attested by the host, and the record names both. The sender marks the recipient in person when preparing; their name and email remain required for the record and completed copy, but no invitation, reminder or resend is emailed to them. The [detailed record rules](docs/contract/record-rules.md#route-007) apply.

**Acceptance.**
1. an admin hosts an in-person signer at 768 pixels, the signer signs, and the certificate records the host, the attestation and the device; the same preparation, attestation, signing and return to sign-in work at 1440 and 390 pixels, with direct transport assertions of the identity and session boundaries.

**Evidence.** `tests/in-person.test.mjs`, `tests/journeys/in-person.mjs`, `src/inkwell/in-person.ts`, `src/ui/host-signing.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: an admin hosts an in-person signer at 768 pixels, the signer signs; the certificate records the host, the attestation; the device; the same preparation, attestation, signing and return to sign-in work at 1440 and 390 pixels, with direct transport assertions of the identity and session boundaries.

#### ROUTE-008 — Contacts and recent recipients

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** Senders pick recipients from a shared contact book and recent recipients, with name, email, phone and company; contacts can be imported from CSV and synced from the CRM. The [detailed record rules](docs/contract/record-rules.md#route-008) apply.

**Acceptance.**
1. import 200 contacts from CSV and autocomplete a recipient by company.
2. The book is one per account: owners, admins and senders read, add, change, remove and import contacts, and viewers and agent tokens cannot (`ACCESS-001`).
3. A contact is one email, kept in lower case, with a name (up to 160 characters) and an optional phone (digits, spaces, brackets, dots or dashes with an optional leading +, up to 40 characters) and company (up to 160); saving or importing an email already in the book updates that contact.
4. A CSV import is UTF-8 text up to 1 MiB whose first row names the columns, name and email and optionally phone and company in any order (other columns are ignored), then up to 1,000 rows; each invalid row is reported with its line number and nothing of it is saved.

**Evidence.** `src/inkwell/contacts.ts`, `src/ui/contacts.tsx`, `tests/api.test.mjs`, `tests/journeys/contacts.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: each invalid row is reported with its line number; nothing of it is saved.

#### ROUTE-013 — Contact selection and connector sync

Core · target · **partial** · From ROUTE-008 · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** This capability governs contact selection and connector sync. The [detailed record rules](docs/contract/record-rules.md#route-008) apply.

**Acceptance.**
1. While preparing, the sender searches the book by name, email or company (case-insensitive, contains) and adds a contact as a signer or as a copy recipient; with nothing typed they see their recent recipients, the last 20 different signers and copy recipients on envelopes they prepared, newest first, with the book's company.
2. Contacts are installation state and do not travel in an archive.
3. Syncing from the CRM arrives with the CRM connectors: `INTEG-015`, `INTEG-002` and `INTEG-003` each bring their contacts into this book before they ship.

**Evidence.** `src/inkwell/contacts.ts`, `src/ui/contacts.tsx`, `tests/api.test.mjs`, `tests/journeys/contacts.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Contacts are installation state and do not travel in an archive; Syncing from the CRM arrives with the CRM connectors: `INTEG-015`, `INTEG-002` and `INTEG-003` each bring their contacts into this book before they ship.

#### ROUTE-009 — Sign it yourself

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** A signed-in member signs their own document with nobody else involved: they upload it (or pick it from a connected store or mailbox add-in, `INTEG-004`, `INTEG-005`), place their own fields, and sign in the app with no invitation and no mailbox code, because their signed-in session (and its sign-in method: email link, passkey or SSO, with any second factor under `ADMIN-009`) is the authentication, which the certificate records. They then download the executed PDF and certificate, file them, and optionally send the completed copy to other people. The [detailed record rules](docs/contract/record-rules.md#route-009) apply.

**Acceptance.**
1. a member self-signs a three-page PDF and the mail fake records no message; the certificate names session authentication and the sign-in method; the member downloads the executed PDF and certificate and sends the completed copy to two addresses; a second self-signed document reuses the saved signature without adopting it again; on another envelope the sender at order 1 signs in the app right after approval, and the order-2 signer is invited only after that signature.
2. Here the sender is the member who approves: every first-order recipient whose email is theirs is left out of the invitations and signs in the app, so a self-signed envelope (approved, then signed by its only recipient) sends no message, and the envelope's own sender is never emailed its completed copy because their account files it (`DELIV-007`).
3. The certificate states the session's sign-in method as Inkwell records it: an emailed invitation link, an emailed sign-in link, owner setup, single sign-on (OIDC), a password, local development sign-in or review sign-in; passkeys and second factors are added to it by `ADMIN-009` before it ships.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/envelopes.ts`, `src/inkwell/own-signing.ts`, `src/inkwell/saved-marks.ts`, `src/inkwell/completed-copies.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: the envelope's own sender is never emailed its completed copy because their account files it (`DELIV-007`); passkeys and second factors are added to it by `ADMIN-009` before it ships.

#### ROUTE-014 — Saved self-signing marks

Core · target · **partial** · From ROUTE-009 · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** This capability governs saved self-signing marks. The [detailed record rules](docs/contract/record-rules.md#route-009) apply. Picking a document from a store or mailbox arrives with `INTEG-004` and `INTEG-005`, each before it ships.

**Acceptance.**
1. The saved signature is the typed name a member last signed with through their session; it is offered for their next in-app signing, and signing with another replaces it; the record and certificate say when it was reused.
2. The completed copy goes to 1–20 more people, within the envelope's 20 copy recipients, by whoever may change the envelope, through `DELIV-007`'s delivery, and the record names who sent it.
3. Saved signatures are installation state and do not travel in an archive.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/envelopes.ts`, `src/inkwell/own-signing.ts`, `src/inkwell/saved-marks.ts`, `src/inkwell/completed-copies.ts`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: it is offered for their next in-app signing, and signing with another replaces it; the record and certificate say when it was reused; The completed copy goes to 1–20 more people, within the envelope's 20 copy recipients, by whoever may change the envelope, through `DELIV-007`'s delivery; the record names who sent it.

#### ROUTE-010 — Witnesses nominated by their signer

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** The sender requires or allows up to two witnesses for a signer. The signer nominates each witness by name and email while signing (or the sender names them in advance), and a witness cannot be the signer or another recipient of the envelope. The [detailed record rules](docs/contract/record-rules.md#route-010) apply.

**Acceptance.**
1. signer 1 nominates a witness while signing; the witness is invited only after signer 1 signs and order 2 waits for the witness; the witness verifies, sees only signer 1's document and their own fields, not a document visible only to signer 2, and signs; the certificate names the witness against signer 1; nominating the signer's own email as witness is refused; a declining witness returns the step to signer 1, who nominates another.

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/recipient-roles.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: signer 1 nominates a witness while signing; the witness is invited only after signer 1 signs; order 2 waits for the witness; the witness verifies, sees only signer 1's document; their own fields, not a document visible only to signer 2, and signs; the certificate names the witness against signer 1; nominating the signer's own email as witness is refused; a declining witness returns the step to signer 1, who nominates another.

#### ROUTE-011 — Recipients who name, edit or only view

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** Besides signers and approvers, a recipient can be a specify-recipients agent, who enters the names and emails of later recipients the sender left open; an editor, who may change later recipients, their fields and the messages before passing the envelope on, with every change audited; needs to view, who must open the documents before routing continues; or certified delivery, who must open them and whose authenticated PDF-opening request is recorded as the delivery event, not human reading. Each of these roles carries `ROUTE-003`'s include rules, as a recipient who acts, before it ships. The [detailed record rules](docs/contract/record-rules.md#route-011) apply. The grant and observed-opening rules of RL-103 are exercised in ROUTE-015.

**Acceptance.**
1. an agent at order 1 names the order-3 signer, who is then invited; an editor at order 2 adds a field and changes a later recipient's email, and the audit trail shows both; a needs-to-view recipient blocks order 3 until they open the documents; a certified-delivery recipient's view time is on the certificate.
2. A naming agent fills only identities left open by that sender; an editor changes only granted, unactivated later identities, private messages and fields on documents visible to both editor and target.
3. They cannot add recipient places, delegate authority again, change roles, routing, authentication, account permissions, original bytes or document audiences, or change an envelope-wide message after earlier action.
4. Each action needs the current recipient's authentication, disclosure agreement and explicit audited consent.
5. A skipped naming agent leaves any unresolved identity held for sender correction, with no invitation.
6. Needs-to-view and certified-delivery steps complete only after successful authenticated PDF-opening requests cover every visible original component; the record and certificate say this observes a PDF request and does not assert human reading.
7. Repeated requests are idempotent.

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/recipient-actions.mjs`, `tests/journeys/recipient-template-actions.mjs`, `tests/freeform-fields.test.mjs`, `tests/journeys/recipient-freeform-actions.mjs`
**Gap.** ct approval pending for the adopted conservative default: signed-in owner/admin grants to existing later places only; private messages and shared-document fields only, no account/global-message/role/order/authentication/audience authority; explicit audited consent; delivery evidence is an authenticated PDF request, never asserted human reading. Until ct approves this policy, the clause stays partial.

#### ROUTE-015 — Observed openings and recipient delegation

Core · target · **partial** · From ROUTE-011 · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** This capability governs observed openings and recipient delegation. The [detailed record rules](docs/contract/record-rules.md#route-011) apply. `ADMIN-004` and future `API-003` recipient doors inherit these grant and document-scope boundaries before shipping.

**Acceptance.**
1. Copies/templates retain grants and reset open identities and actions; signed custody and restore bind grants, edits and openings to the audit trail.
2. Current explicit grants cover only existing unactivated later places. Authenticated, consented edits stay within the allowed fields and common document audience (RL-103).
3. A view step advances only after authenticated successful PDF-opening requests for every visible original. The recorded opening is a request, never proof of human reading (RL-103).

**Evidence.** `tests/routing.test.mjs`, `tests/journeys/recipient-actions.mjs`, `tests/journeys/recipient-template-actions.mjs`, `tests/freeform-fields.test.mjs`, `tests/journeys/recipient-freeform-actions.mjs`
**Gap.** ct approval pending for the adopted conservative default: signed-in owner/admin grants to existing later places only; private messages and shared-document fields only, no account/global-message/role/order/authentication/audience authority; explicit audited consent; delivery evidence is an authenticated PDF request, never asserted human reading. Until ct approves this policy, the clause stays partial.

#### ROUTE-012 — Document visibility per recipient

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** In a multi-document envelope the sender chooses which documents each recipient may see; by default a recipient sees every document, and an account policy can hide documents in which a recipient has no fields. Hidden documents are absent from that recipient's signing view, downloads, completed copy, embedded view and API recipient view, and the certificate states which documents each recipient was shown. The [detailed record rules](docs/contract/record-rules.md#route-012) apply.

**Acceptance.**
1. an envelope with an offer letter and a compensation memo for the hiring manager: the candidate never sees the memo while signing, in downloads, in their completed copy or through the API recipient view; the manager sees and signs both; the certificate lists each recipient's visible documents.
2. Hidden documents cannot contain that signer’s fields or a required signature for them.
3. The owner/admin’s versioned envelope-default setting can narrow selected audiences to recipients with fields when a draft or template is saved or used; a copy recipient has no fields and then receives only a scoped certificate.
4. Existing saved records and sent envelopes keep their visibility.
5. Signing views and PDFs use consecutive visible-page numbers, mapped back to canonical pages for fields, progress and comments.
6. Per-document URL guesses are refused, and recipient certificates omit hidden document names and field evidence while the record-holder certificate lists every recipient’s visible documents.
7. Page threads cannot be shared with a recipient who cannot see their document.

**Evidence.** `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: an envelope with an offer letter; a compensation memo for the hiring manager: the candidate never sees the memo while signing, in downloads, in their completed copy or through the API recipient view; the manager sees and signs both; the certificate lists each recipient's visible documents; Hidden documents cannot contain that signer’s fields or a required signature for them; The owner/admin’s versioned envelope-default setting can narrow selected audiences to recipients with fields when a draft or template is saved or used; a copy recipient has no fields and then receives only a scoped certificate; Existing saved records and sent envelopes keep their visibility; Signing views and PDFs use consecutive visible-page numbers, mapped back to canonical pages for fields, progress and comments; Per-document URL guesses are refused, and recipient certificates omit hidden document names and field evidence while the record-holder certificate lists every recipient’s visible documents; Page threads cannot be shared with a recipient who cannot see their document.

#### ROUTE-016 — Visible-document artifacts and copying

Core · target · **partial** · From ROUTE-012 · Cites BASE-ROLE-001, BASE-AUDIT-001 · Rules D-1

**Requirement.** This capability governs visible-document artifacts and copying. The [detailed record rules](docs/contract/record-rules.md#route-012) apply. `ROUTE-001`, `ROUTE-010`, `ROUTE-011` and `API-003` inherit the restrictions for every future role and embedded recipient door before shipping. `PREP-003` inherits this visibility boundary before attachment sharing ships; visibility of a parent document alone never grants attachment bytes, and uploader/record-holder-only attachment rule remains the default. No attachment upload or wider byte sharing is claimed by this clause.

**Acceptance.**
1. A paper scan accompanies a recipient bundle only when every document its uploader could see is visible to that recipient; recipient component downloads exclude any scan whose uploader could see a hidden document, while the record holder retains the full original component and scan record.
2. Corrections preserve the signer place’s grant and reindex copy grants by the existing copy email; new corrected copy recipients receive no restricted documents.
3. A sender’s explicit post-completion copy action chooses its documents (all by default), with the audience change audited.
4. Draft edits, copies, template save/use/edit, archive verification, holds, retention and erasure carry the same scope.

**Evidence.** `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A paper scan accompanies a recipient bundle only when every document its uploader could see is visible to that recipient; recipient component downloads exclude any scan whose uploader could see a hidden document, while the record holder retains the full original component and scan record; Corrections preserve the signer place’s grant and reindex copy grants by the existing copy email; new corrected copy recipients receive no restricted documents; A sender’s explicit post-completion copy action chooses its documents (all by default), with the audience change audited; Draft edits, copies, template save/use/edit, archive verification, holds, retention and erasure carry the same scope.

### Signer experience

#### SIGNX-001 — Guided mobile-first signing

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Signing works on a phone at 360 pixels without zooming: a Start and Next button walks the signer through every required field, a progress count shows what remains, the document pages render sharply and load progressively, and the signer can finish later from the same link. The [detailed record rules](docs/contract/record-rules.md#signx-001) apply.

**Acceptance.**
1. a signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes; the journey records time to first page under 3 seconds on a throttled mobile profile.
2. Start, then each Next, goes to the next of the signer's required fields still empty in reading order (by page, then top to bottom, then left to right), scrolls the document to it and puts its entry at the foot of the screen; after the last, Next goes to the consent.
3. Every required placed field is included; optional fields (`PREP-003`) and fields a signer places themselves (`PREP-011`) join Next and the count before they ship.
4. The count reads how many of the signer's required fields are complete and how many are left.
5. Each Next, and Finish later, saves the signer's entries on the server; reopening the same link (after the same verification as signing: the 24-hour signing session, or a new code) brings them back, and Start resumes at the first empty field.

**Evidence.** `src/ui/signing-guide.tsx`, `src/inkwell/progress.ts`, `tests/journeys/signing-mobile.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: a signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes; the journey records time to first page under 3 seconds on a throttled mobile profile; Start, then each Next, goes to the next of the signer's required fields still empty in reading order (by page, then top to bottom, then left to right), scrolls the document to it and puts its entry at the foot of the screen; after the last, Next goes to the consent; Every required placed field is included; optional fields (`PREP-003`) and fields a signer places themselves (`PREP-011`) join Next; the count before they ship; The count reads how many of the signer's required fields are complete and how many are left; Each Next, and Finish later, saves the signer's entries on the server; reopening the same link (after the same verification as signing: the 24-hour signing session, or a new code) brings them back, and Start resumes at the first empty field.

#### SIGNX-010 — Signing progress and return

Core · target · **partial** · From SIGNX-001 · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** This capability governs signing progress and return. The [detailed record rules](docs/contract/record-rules.md#signx-001) apply. Its published timing profile is defined in the record rules; the three-second bar remains SIGNX-001’s acceptance gate.

**Acceptance.**
1. Saved entries sign nothing, are not evidence and are not archived; they are cleared when the signer signs, electronically or on paper, or the envelope is declined or voided.
2. Pages appear as each one loads and are drawn only near the screen, at the screen's pixel density up to 3x.

**Evidence.** `src/ui/signing-guide.tsx`, `src/inkwell/progress.ts`, `tests/journeys/signing-mobile.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Saved entries sign nothing, are not evidence and are not archived; they are cleared when the signer signs, electronically or on paper, or the envelope is declined or voided; Pages appear as each one loads and are drawn only near the screen, at the screen's pixel density up to 3x.

#### SIGNX-002 — Draw, type or upload signatures and initials

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** The signer adopts a signature and initials by typing (choice of styles), drawing with finger or mouse, or uploading an image; the adopted marks are applied to every signature and initials field, and the record keeps the adoption method. A signed-in member's adopted marks are saved and reused (`ROUTE-009`). The [detailed record rules](docs/contract/record-rules.md#signx-002) apply.

**Acceptance.**
1. one signer draws on a touch screen, another types and a third uploads; all three appear in the executed PDF and the certificate records each method.
2. The executed PDF carries that mark in every signature field: a typed name in its style, or the image centered in the field and scaled to fit with its proportions kept.
3. A signer who adopts nothing is typed in Sans italic, as every envelope signed before adoption existed was.
4. The mark is adopted at signing: Finish later (`SIGNX-001`) keeps the names entered but not the adopted mark.
5. The record keeps the method, the typed style or the image's type and SHA-256, and the image itself with the envelope's documents (so it travels in archives and is erased with the envelope); the certificate states each signature's method with its style or fingerprint (`RECORD-002`).
6. A member's saved mark keeps its method and image and is offered on their next in-app signing.

**Evidence.** `src/inkwell/marks.ts`, `src/inkwell/pdf.ts`, `src/ui/adopt-signature.tsx`, `tests/api.test.mjs`, `tests/journeys/signing-mobile.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The mark is adopted at signing: Finish later (`SIGNX-001`) keeps the names entered but not the adopted mark; the image itself with the envelope's documents (so it travels in archives and is erased with the envelope); A member's saved mark keeps its method and image and is offered on their next in-app signing.

#### SIGNX-003 — Accessible signing

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1 · Register R-1, R-2

**Requirement.** Signing and preparation apply the shared accessibility duty to every field and signing state, both themes and 200% zoom. The human screen-reader review and VPAT are field proof, separate from the automated keyboard and accessibility-tree journeys. The [detailed record rules](docs/contract/record-rules.md#signx-003) apply.

**Acceptance.**
1. At 1440 and 390, complete signing and preparation on a realistic envelope under BASE-ACCESSIBILITY-001.
2. At 200% zoom, field entry, error recovery and completion remain usable in both themes.

**Evidence.** `tests/journeys/accessible-signing.mjs`, `tests/journeys/a11y.mjs`, `tests/journeys/field-placement.mjs`, `src/ui/signer-app.tsx`, `src/ui/signing-guide.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: At 1440 and 390, complete signing and preparation on a realistic envelope under BASE-ACCESSIBILITY-001; At 200% zoom, field entry, error recovery and completion remain usable in both themes.

#### SIGNX-004 — Decline with reason

Core · target · **done** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A signer declines with a required reason; the envelope stops, the sender and earlier signers are notified, and the reason is in the record. The [detailed record rules](docs/contract/record-rules.md#signx-004) apply.

**Acceptance.**
1. the second signer declines; the third is never invited, the sender receives a notice with the reason, and the certificate records the decline.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/signing.ts`, `src/inkwell/pdf.ts`, `src/ui/signer-app.tsx`
**Gap.** None.

#### SIGNX-005 — ESIGN and UETA consumer disclosure

Core · target · **done** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Before first signing, a signer reviews the account's electronic record and signature disclosure (how to withdraw consent, request a paper copy, update contact details and the hardware and software needed) and agrees to it; the disclosure version and agreement time are in the record. A signer can withdraw consent, which stops the envelope and notifies the sender. The [detailed record rules](docs/contract/record-rules.md#signx-005) apply.

**Acceptance.**
1. a new signer sees and accepts the disclosure; a second signer withdraws consent and the envelope stops with the withdrawal recorded; the certificate quotes the disclosure version.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/disclosure.ts`, `src/inkwell/signing.ts`, `src/inkwell/pdf.ts`, `src/ui/signer-app.tsx`
**Gap.** None.

#### SIGNX-006 — Branded sending and signing

Core · target · **missing** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** An account brand sets logo, colors, sender display name, reply-to address, email footer and a custom sending domain; brands can differ per template. The [detailed record rules](docs/contract/record-rules.md#signx-006) apply.

**Acceptance.**
1. two brands on two templates; invitations and signing pages show each brand's logo and colors, and email headers use its reply-to and domain.

**Evidence.** None.
**Gap.** No customer branding

#### SIGNX-007 — English and Spanish signing

Core · target · **missing** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Signing pages, emails, disclosures and the certificate are available in English and Spanish, chosen per recipient or by the signer. The [detailed record rules](docs/contract/record-rules.md#signx-007) apply.

**Acceptance.**
1. a recipient set to Spanish receives a Spanish invitation, signs on Spanish pages and receives a Spanish completion email; the certificate shows the language used.
2. The Spanish signing pages join `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before they ship.

**Evidence.** None.
**Gap.** English only

#### SIGNX-008 — Signer document actions and paper signing

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Before and after signing, a signer can download and print the documents visible to them (`ROUTE-012`). When the sender allows it, a signer can choose to sign on paper instead: they download the documents, sign them by hand, and upload a scan or phone photo; the sender reviews and accepts or rejects the upload, and the record marks that recipient's signature as wet ink with the uploaded pages' fingerprint, which the certificate states. The [detailed record rules](docs/contract/record-rules.md#signx-008) apply.

**Acceptance.**
1. a signer downloads and prints the document before signing; on an envelope that allows paper signing, a signer uploads a three-page scan, the sender accepts it and the certificate marks the signature as wet ink with the scan's fingerprint; when paper signing is not allowed, the option is absent and the API refuses the upload.

**Evidence.** `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: the API refuses the upload.

#### SIGNX-009 — Recipient comments and supplemental documents

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Recipients and the sender exchange comments on a document while it is out for signature, threaded and anchored to a page, visible to the parties the author chooses and kept in the record. The sender attaches supplemental documents (terms, policies, a handbook) that recipients must view or acknowledge but do not sign; each acknowledgment is recorded. The [detailed record rules](docs/contract/record-rules.md#signx-009) apply.

**Acceptance.**
1. a signer comments on page 2, the sender replies, and the next signer sees the thread when it was shared with them; a supplemental handbook must be acknowledged before the signer can finish, and the certificate lists the acknowledgment and its time.
2. Comments and supplemental documents join `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before they ship.
3. Each document declares view or explicit acknowledgment required; requesting approval fixes these bytes and requirements.
4. A verified recipient who accepted the existing disclosure opens the fingerprint-checked PDF; this records that the application served it, not proof the person read or understood it.
5. Explicit acknowledgment requires that opening first.
6. Electronic and paper signing refuse unmet requirements for that recipient and identity; a replacement recipient starts again.
7. The certificate lists every reference document fingerprint and each recipient’s opening and acknowledgment times, without adding the reference pages to the signed PDF.
8. Copies, drafts, templates, archives, verification and erasure retain the document custody; new envelopes retain no earlier acknowledgment.

**Evidence.** `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: a signer comments on page 2, the sender replies; the next signer sees the thread when it was shared with them; a supplemental handbook must be acknowledged before the signer can finish; the certificate lists the acknowledgment; its time; Comments and supplemental documents join `SIGNX-003`'s accessibility scan; its keyboard-only and screen-reader journeys before they ship; Each document declares view or explicit acknowledgment required; requesting approval fixes these bytes and requirements; A verified recipient who accepted the existing disclosure opens the fingerprint-checked PDF; this records that the application served it, not proof the person read or understood it; Explicit acknowledgment requires that opening first; Electronic and paper signing refuse unmet requirements for that recipient and identity; a replacement recipient starts again; The certificate lists every reference document fingerprint; each recipient’s opening and acknowledgment times, without adding the reference pages to the signed PDF; Copies, drafts, templates, archives, verification and erasure retain the document custody; new envelopes retain no earlier acknowledgment.

#### SIGNX-011 — Private comment custody

Core · target · **partial** · From SIGNX-009 · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Rules D-1

**Requirement.** This capability governs private comment custody. The [detailed record rules](docs/contract/record-rules.md#signx-009) apply. ADMIN-005 inherits these comment-event metadata and custody rules before its account-wide log ships.

**Acceptance.**
1. Page-anchored threads use explicitly selected sender and/or recipient identities; the thread author alone changes the audience, and replies inherit it.
2. The author is not added implicitly.
3. A correction changing the name or email, or a reassignment, starts a new recipient identity epoch even when a mailbox is reused.
4. The explicit Record custody export and whole-installation archive carry the complete transcript under the document record-holder’s existing access; custody restoration never grants interactive comment access to the destination owner.

**Evidence.** `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Page-anchored threads use explicitly selected sender and/or recipient identities; the thread author alone changes the audience, and replies inherit it; The author is not added implicitly; A correction changing the name or email, or a reassignment, starts a new recipient identity epoch even when a mailbox is reused; The explicit Record custody export and whole-installation archive carry the complete transcript under the document record-holder’s existing access; custody restoration never grants interactive comment access to the destination owner.

### Signer identity

#### IDV-001 — Per-recipient authentication choice

Core · target · **partial** · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** For each recipient the sender chooses none (link only, as the incumbents default to), email code, access code, SMS code, knowledge-based or phone authentication (`IDV-005`) or identity verification, with account defaults (`ADMIN-004`) and template settings; the first-release email code (`SIGN-001`) is one of these methods, not a requirement on every recipient. The certificate records the method and outcome. The [detailed record rules](docs/contract/record-rules.md#idv-001) apply.

**Acceptance.**
1. one envelope with four recipients using four different methods, one of them link only; each must pass their own method, the link-only recipient signs with no code, and the certificate lists each method and result.

**Evidence.** `src/inkwell/signing.ts`, `src/inkwell/drafts.ts`, `src/inkwell/corrections.ts`, `src/inkwell/templates.ts`, `src/inkwell/certificate.ts`, `src/ui/prepare-envelope.tsx`, `src/ui/signer-app.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The envelope preserves four distinct authentication combinations..

#### IDV-002 — SMS one-time codes

Core · target · **partial** · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** A recipient verifies with a code sent by SMS to a US mobile number through the buyer's Twilio account or Inkwell's registered sender, with resend spacing, expiry and attempt limits matching email codes. The recipient's number is corrected in flight like their email (`DELIV-006`), and the sender resends the invitation by SMS like by email (`DELIV-005`). The [detailed record rules](docs/contract/record-rules.md#idv-002) apply.

**Acceptance.**
1. through an SMS provider fake, a recipient receives and enters a code, a wrong code and an expired code are refused, and the certificate records the masked number; a `DELIV-006` correction of a recipient's number is audited with its before and after values and the old link refuses; a `DELIV-005` resend by SMS through the provider fake reaches the signer, who opens the SMS link and signs, and after rotation the old link refuses.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/sms.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: through an SMS provider fake, a recipient receives and enters a code, a wrong code; an expired code are refused; the certificate records the masked number; a `DELIV-006` correction of a recipient's number is audited with its before and after values; the old link refuses; a `DELIV-005` resend by SMS through the provider fake reaches the signer, who opens the SMS link and signs, and after rotation the old link refuses.

#### IDV-003 — Access codes

Core · target · **partial** · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** The sender sets an access code shared out of band; the recipient must enter it before seeing the document, with attempt limits. The [detailed record rules](docs/contract/record-rules.md#idv-003) apply.

**Acceptance.**
1. a recipient is refused with a wrong code, locked after five attempts, and admitted with the right one.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/signing.ts`, `src/inkwell/envelopes.ts`, `src/ui/signer-app.tsx`, `src/ui/prepare-envelope.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: A wrong access code is refused..

#### IDV-004 — Identity document verification through a provider

Core · target · **partial** · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** A recipient verifies a government photo ID and a selfie through Persona or Stripe Identity before signing; Inkwell stores only the provider's verification reference, result and name match, never the ID images. It joins `IDV-001`'s per-recipient choice (prepare screen, drafts, corrections, template roles) and the certificate's method and outcome line before it ships. The [detailed record rules](docs/contract/record-rules.md#idv-004) apply.

**Acceptance.**
1. through a provider fake, a matching verification admits the signer, a failed one refuses with a retry, and the record holds only the reference and outcome.
2. Stripe Identity hosts government photo ID collection and the matching-selfie check.
3. Persona remains a supported-provider target, not an implemented-provider claim.
4. Only the recipient using the current invitation’s authorized signing session may consent and start verification.
5. A sender, administrator, API credential or agent cannot consent or complete verification for that recipient.
6. Stripe collects and processes these directly under its privacy notice.
7. Inkwell keeps the verification reference, result and whether my name matched, plus consent and authentication audit evidence.
8. Before starting the configured provider check, show the provider, applicable privacy notice and exact versioned consent: the signer understands that government photo ID and a matching selfie are sent to that provider, Inkwell retains no ID image, selfie or raw response, and verification is required for this request.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-006 — Identity consent and retry boundaries

Core · target · **partial** · From IDV-004 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs identity consent and retry boundaries. The [detailed record rules](docs/contract/record-rules.md#idv-004) apply.

**Acceptance.**
1. Declining sends no verification request and grants no admission.
2. Compare the provider’s verified full name with the invitation’s recorded recipient full name using Unicode NFC normalization, Unicode case folding, trimming and collapse of Unicode whitespace runs to one space.
3. Require exact equality of the resulting nonempty strings.
4. Do not remove accents, punctuation, hyphens, apostrophes, titles or suffixes; do not reorder names, transliterate, expand initials or apply fuzzy matching.
5. Missing or ambiguous verified names refuse admission.
6. A mismatch refuses admission and permits a new provider attempt under the existing one-minute spacing and ten-start limit; it never rewrites the recipient’s name or permits manual approval.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-007 — Identity evidence and inactive restore

Core · target · **partial** · From IDV-004 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs identity evidence and inactive restore. The [detailed record rules](docs/contract/record-rules.md#idv-004) apply.

**Acceptance.**
1. Admission requires authenticated provider proof that the current invitation’s bound session passed both document verification and matching-selfie verification and passed the name comparison.
2. A browser return, pending result, unknown result, expired session, invalid callback, replay or result for another invitation never admits.
3. An unfinished provider session expires no later than 24 hours after creation and earlier when its provider expiry, invitation validity or envelope validity ends.
4. Expiry never renews admission or resets a start limit.
5. Retain only the provider reference, normalized outcome and name-match flag as provider-derived business evidence.
6. Consent version and exact wording or its immutable version reference, recipient and invitation identifiers, provider and method, actor, timestamps, authentication network evidence, and normalized start, expiry and refusal events form the ordinary audit evidence.
7. Do not retain verified provider names, ID numbers, document images, selfies, biometric data or raw provider responses in records, logs, traces, mail, command receipts or archives.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-008 — Identity-check historical custody

Core · target · **partial** · From IDV-004 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs identity-provider qualification. The [detailed record rules](docs/contract/record-rules.md#idv-004) apply.

**Acceptance.**
1. The certificate states the method and result without claiming notarization or legal identity certification.
2. Apply RECORD-005, PORT-001 and ERASE-001 without creating a separate identity retention period.
3. Restored references preserve historical evidence but grant no active authentication; restored unfinished invitations require fresh consent and fresh provider proof.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-005 — Knowledge-based and phone authentication

Core · target · **partial** · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** For US recipients the sender can require knowledge-based authentication (questions from public and credit records through an identity provider such as LexisNexis Risk Solutions) or phone authentication (a code delivered by voice call or SMS through Twilio to a number the sender sets). Attempts are limited, a failed recipient is locked with a notice to the sender, and Inkwell stores only the provider's reference and pass or fail, never the questions or answers. The [detailed record rules](docs/contract/record-rules.md#idv-005) apply.

**Acceptance.**
1. through provider fakes, a recipient who passes the questions is admitted, one who fails twice is locked and the sender notified; a voice-call code admits a second recipient; the record holds only the references and outcomes.
2. Authenticate hosts the configured mandatory knowledge-based authentication workflow.
3. Other named knowledge providers remain targets until separately proved.
4. Only the recipient using the current invitation’s authorized signing session may consent and start the hosted workflow.
5. Authenticate processes those details and my answers under its privacy notice.
6. Inkwell uses my date of birth only to start this check and does not retain it, the questions or my answers.
7. Inkwell keeps verification references, results, attempt counts and consent audit evidence.
8. Before starting, show the provider, applicable privacy notice and exact versioned consent for the mandatory knowledge-check workflow, transient identity details, reference-only evidence, two-failure lock and sender notification. Voice authentication has separate explicit call consent.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-009 — Knowledge-check attempts and locking

Core · target · **partial** · From IDV-005 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs knowledge-check attempts and locking. The [detailed record rules](docs/contract/record-rules.md#idv-005) apply.

**Acceptance.**
1. Declining sends no identity details and grants no admission.
2. Transient details must be excluded from persistence, logs, traces, mail, command receipts and archives, including error paths.
3. Authenticate admission requires authenticated evidence for the current invitation’s bound applicant, actual mandatory-KBA workflow and current session.
4. A provider pass without those bindings never admits.
5. Count every distinct completed unsuccessful hosted session once, adding its provider-reported consumed attempts, with a minimum of one.
6. Count across replacement sessions.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-010 — Knowledge-check accounting and sender notice

Core · target · **partial** · From IDV-005 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs knowledge-check identity and recovery. The [detailed record rules](docs/contract/record-rules.md#idv-005) apply.

**Acceptance.**
1. Repeated results do not count twice.
2. Missing, malformed or contradictory attempt evidence refuses admission and prevents another start until reconciled; it does not count as zero or establish a completed failure without evidence.
3. Provider cancellation or technical failure is not automatically an identity failure, but remains subject to start limits and deny-by-default admission.
4. At a cumulative count of two or more unsuccessful attempts, lock the invitation atomically with one durable sender Activity notice and one configured email dispatch record.
5. Delivery failure remains visible and never unlocks the invitation or erases the notice.
6. No questions, answers or verification codes are retained.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-011 — Knowledge-check retention and custody

Core · target · **partial** · From IDV-005 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs knowledge-check retention and custody. The [detailed record rules](docs/contract/record-rules.md#idv-005) apply.

**Acceptance.**
1. A lock has no automatic expiry.
2. Only an owner, administrator or sender with current correction authority over that envelope may initiate recovery through the existing audited unsigned-recipient correction process, recording a reason.
3. Recovery creates a new invitation, revokes the old invitation and all its sessions, preserves historical outcomes and lock notices, and requires fresh recipient consent and provider verification.
4. Nobody may unlock the same invitation by resetting counters, accept a provider failure manually or alter signed evidence.
5. Changing provider sessions, waiting, restoring an archive or restoring a role does not unlock it.
6. An unfinished hosted session expires no later than 24 hours after creation and earlier at provider, invitation or envelope expiry.
7. Expiry does not reset attempt or start counters.
8. Preserve the existing one-minute start spacing, ten-start limit and refusal to retry uncertain creation automatically.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

#### IDV-012 — Knowledge and voice evidence custody

Core · target · **partial** · From IDV-005 · Cites BASE-SECRET-001, BASE-ROLE-001 · Register R-8

**Requirement.** This capability governs voice-code consent and evidence. The [detailed record rules](docs/contract/record-rules.md#idv-005) apply.

**Acceptance.**
1. Retain provider references, normalized outcomes and minimum attempt and lock evidence, with consent version, invitation binding, actor and timestamps; never retain date of birth, questions, answers, codes, raw provider responses or usable hosted capabilities in business records or archives.
2. Existing sealed capabilities remain installation state only while needed for the active session.
3. RECORD-005, PORT-001 and ERASE-001 govern business evidence.
4. Restore preserves historical outcomes and locks, grants no active provider authentication and requires fresh consent for new verification.
5. Voice authentication retains the five-incorrect-check lock, sender notification and sender-set number; no questions, answers or verification codes are retained.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs`
**Gap.** CT policy ruling, 25 October 2026: APPROVED WITH RIDERS. This approves the product defaults below only. Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.

### Delivery and follow-up

#### DELIV-001 — Live delivery with per-message status

Core · target · **done** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** Invitations, codes and notices go out through the configured provider and each message shows queued, sent, delivered, opened, bounced or failed from provider events. Uncertain provider responses are never blindly retried. The [detailed record rules](docs/contract/record-rules.md#deliv-001) apply.

**Acceptance.**
1. through a mail provider fake, a sent invitation moves to delivered and opened from provider webhooks, and an uncertain send is shown as uncertain with no duplicate.

**Evidence.** `src/inkwell/delivery.ts`, `src/inkwell/mail.ts`, `tests/delivery.test.mjs`
**Gap.** None.

#### DELIV-002 — Bounces and bad addresses

Core · target · **done** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** A hard bounce or rejected address flags the recipient, pauses their reminders and alerts the sender, who corrects the address and resends in one step. The [detailed record rules](docs/contract/record-rules.md#deliv-002) apply.

**Acceptance.**
1. a bounce event marks the recipient, the sender is alerted, corrects the email and the corrected recipient signs.

**Evidence.** `src/inkwell/bounces.ts`, `tests/delivery.test.mjs`
**Gap.** None.

#### DELIV-003 — Automatic reminders

Core · target · **done** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** Reminders start N days after a recipient's invitation and repeat every M days, only to recipients whose action is current, within the account's US time zone and business days, and stop at signature, decline, void or expiry. Account, template and envelope levels set them. The [detailed record rules](docs/contract/record-rules.md#deliv-003) apply.

**Acceptance.**
1. with the clock advanced, a current signer receives reminders on days 2, 4 and 6 skipping a weekend, a waiting signer receives none, and reminders stop after the signature.

**Evidence.** `src/inkwell/reminders.ts`, `src/inkwell/scheduled.ts`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs`
**Gap.** None.

#### DELIV-004 — Configurable expiry with warnings

Core · target · **partial** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** Expiry is set per envelope, template or account (default 120 days), recipients and the sender are warned before it, and the sender can extend it before or after expiry without re-preparing. The [detailed record rules](docs/contract/record-rules.md#deliv-004) apply.

**Acceptance.**
1. an envelope set to expire in 10 days warns on day 7, the sender extends it by 14 days, and the signer signs on day 12.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/expiry.ts`, `src/server.ts`, `src/ui/envelope-detail.tsx`, `src/ui/prepare-envelope.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The extension adds fourteen days to expiry.; The signer completes on day 12..

#### DELIV-005 — Resend by email or SMS

Core · target · **partial** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** The sender resends the current invitation by email or SMS; the old link keeps working unless the sender rotates it. Resend is offered among the envelope detail page's actions (`MANAGE-005`), and each resent message shows its own status there (`DELIV-001`). The [detailed record rules](docs/contract/record-rules.md#deliv-005) apply.

**Acceptance.**
1. resend by email through the provider fake: the same link again, then a new link, after which the old link refuses; the signer opens the resent link and signs; each resent message shows its own status; the resend is made from the envelope detail page (`MANAGE-005`).

**Evidence.** `src/inkwell/resend.ts`, `src/inkwell/links.ts`, `src/ui/envelope-detail.tsx`, `tests/delivery.test.mjs`, `tests/journeys/envelope-detail.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: resend by email through the provider fake: the same link again, then a new link, after which the old link refuses; the signer opens the resent link and signs; each resent message shows its own status; the resend is made from the envelope detail page (`MANAGE-005`).

#### DELIV-006 — Correct an envelope in flight

Core · target · **partial** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** Before a recipient acts, the sender (or anyone the envelope is shared with for editing, or an admin) changes their name, email or phone, adds or removes later recipients, and edits the messages, expiry or the fields of recipients who have not yet acted, without invalidating signatures already given. Corrections are the only way a sent envelope changes (`SEND-001`): each is audited with its before and after values, old links stop working, and a field already signed and a signature already given can never be changed. The [detailed record rules](docs/contract/record-rules.md#deliv-006) apply.

**Acceptance.**
1. after signer 1 signs, correct signer 2's email and add a copy recipient; signer 1's signature stands, the old link for signer 2 refuses, and the new one completes the envelope; an attempt to change signer 1's signed field, through the correction screen or the API, is refused; the audit trail shows each correction with its before and after values.

**Evidence.** `src/inkwell/corrections.ts`, `src/ui/prepare-envelope.tsx`, `src/ui/envelope-detail.tsx`, `tests/delivery.test.mjs`, `tests/journeys/correct-envelope.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: after signer 1 signs, correct signer 2's email and add a copy recipient; signer 1's signature stands, the old link for signer 2 refuses; the new one completes the envelope; an attempt to change signer 1's signed field, through the correction screen or the API, is refused; the audit trail shows each correction with its before and after values.

#### DELIV-007 — Completed copies to every party

Core · target · **done** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** On completion, every recipient and copy recipient receives the executed documents and certificate as an attachment or a secure link (account setting; attachments above 10 MB become links), and the sender's account files them. An envelope has up to 20 copy recipients today (`ROUTE-001`'s copy role, each email different from every signer's), who get no action link. The [detailed record rules](docs/contract/record-rules.md#deliv-007) apply.

**Acceptance.**
1. complete an envelope with two signers and a copy recipient; all three receive the completed copy through the mail fake, and secure links require their mailbox code.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/completed-copies.ts`, `src/inkwell/mail.ts`, `src/ui/completed-copy.tsx`
**Gap.** None.

#### DELIV-008 — Sender notifications

Core · target · **partial** · Cites BASE-MAIL-001, BASE-OPS-003, BASE-AUDIT-001

**Requirement.** Senders get viewed, signed, declined, completed, bounced and expiring notices by email, in an in-app activity feed and, when connected, in Slack, Microsoft Teams or Nook; each person chooses which they receive. The [detailed record rules](docs/contract/record-rules.md#deliv-008) apply.

**Acceptance.**
1. a sender subscribed to declines and completions in Slack, Microsoft Teams, Nook and email receives each through the Slack and Teams fakes, a Nook test installation and the mail fake, and nothing else; after unsubscribing from completions in Teams, the next completion reaches the other three channels and not Teams; every notice appears in the in-app activity feed.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/accessible-signing.mjs`, `src/inkwell/notices.ts`, `src/inkwell/seal.ts`, `src/ui/activity.tsx`, `migrations/core/0030_notices.sql`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Decline and completion notifications reach Slack.; Decline and completion notifications reach Microsoft Teams.; Decline and completion notifications reach a Nook test installation.; Decline and completion notifications reach email.; No other notification is sent under those subscriptions.; Unsubscribed Teams receives no later completion.; The other three channels receive the later completion.; Every notice appears in the in-app activity feed..

### Bulk send and web forms

#### BULK-001 — Bulk send from a spreadsheet

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** From a template, a sender uploads a CSV or XLSX of up to 1,000 rows (one envelope per row, with role names, emails and prefill values); a preview validates every row before anything is sent; the sender's one approval of the batch (or the account's sending policy for bulk send, `ADMIN-004`) sends every valid row with no per-envelope approval, and each envelope's record names the batch and its authority (`SEND-001`); the batch shows per-row status, the sender can resend, correct or void remaining rows, and a recipient list can be saved and reused for a later batch. The [detailed record rules](docs/contract/record-rules.md#bulk-001) apply.

**Acceptance.**
1. upload 500 rows with three invalid emails; the preview marks the three, the sender approves the batch once, the other 497 envelopes send with no further approval and each record names the batch, and the batch shows each envelope's status as they complete; the saved list feeds a second batch with no re-upload.
2. BULK-001 retains the SEND-001 and ADMIN-004 release duties for every remaining row: current principal authority, contributing policy versions, template revision and sending-definition fences in the invitation transaction; additive internal approval; hold notifications; no automatic revival; and fresh confirmation of the frozen definition and bytes.
3. Gap: Unproved: complete bulk authority and concurrent release-fence assertions; hold notifications for remaining rows; newly required internal approval at release; permanent non-revival after principal loss; and fresh confirmation preserving the original frozen definition, approval rule and bytes after live template edits or deletion.
4. The exact-candidate capacity execution is recorded separately in the fleet receipt.

**Evidence.** `tests/bulk.test.mjs`, `tests/journeys/bulk-capacity.mjs`, `tests/journeys/bulk.mjs`
**Gap.** Unproved: complete bulk authority and concurrent release-fence assertions; hold notifications for remaining rows; newly required internal approval at release; permanent non-revival after principal loss; and fresh confirmation preserving the original frozen definition, approval rule and bytes after live template edits or deletion. The exact-candidate capacity execution is recorded separately in the fleet receipt.

#### FORM-001 — Public signing web forms

Core · target · **partial** · Cites BASE-PUBLIC-001, BASE-PUBLIC-002, BASE-ACCESSIBILITY-001

**Requirement.** A template becomes a web form with a link, QR code and embed snippet; the signer enters their own name and email, verifies the email, signs, and the envelope can route to a company countersigner. A submission creates and sends its envelope on its own under the account's sending policy for web forms (`ADMIN-004`), with no per-envelope human approval, and the record names that policy (`SEND-001`). The [detailed record rules](docs/contract/record-rules.md#form-001) apply.

**Acceptance.**
1. open a form link signed out, verify an email and sign; the envelope is sent with no human approval step and its record names the web-form policy; the company signer countersigns; a bot request without a Turnstile token and a submission past the limit are refused.
2. a native owner/admin or explicitly permitted sender publishes an immutable form pinned to the current visible template version, one public signer role and fixed other recipients.
3. The API returns its public link, SVG QR and iframe snippet.
4. Turnstile is checked server-side at code request, email verification and submission, with action and installation hostname validation.
5. Codes expire in ten minutes, allow five attempts and are limited to three per normalized email/form in a rolling hour, including failed mail.
6. Submission consumes the hash-only ten-minute email admission token with the envelope creation, current owner/permission/template and policy fences, total/daily counters, one-per-email rolling 24-hour fence and account-wide ten-per-IP rolling-hour fence.
7. Total defaults to 100 (maximum 10,000), daily to 50 (UTC calendar days) and expiry to 90 whole days (maximum 365).

**Evidence.** `tests/web-forms.test.mjs`, `tests/journeys/forms.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: open a form link signed out, verify an email and sign; the envelope is sent with no human approval step; its record names the web-form policy; the company signer countersigns; a bot request without a Turnstile token; a submission past the limit are refused; a native owner/admin or explicitly permitted sender publishes an immutable form pinned to the current visible template version, one public signer role and fixed other recipients; The API returns its public link, SVG QR and iframe snippet; Turnstile is checked server-side at code request, email verification and submission, with action and installation hostname validation; Codes expire in ten minutes, allow five attempts and are limited to three per normalized email/form in a rolling hour, including failed mail; Submission consumes the hash-only ten-minute email admission token with the envelope creation, current owner/permission/template and policy fences, total/daily counters, one-per-email rolling 24-hour fence and account-wide ten-per-IP rolling-hour fence; Total defaults to 100 (maximum 10,000), daily to 50 (UTC calendar days) and expiry to 90 whole days (maximum 365).

#### FORM-002 — Public form release and custody

Core · target · **partial** · From FORM-001 · Cites BASE-PUBLIC-001, BASE-PUBLIC-002, BASE-ACCESSIBILITY-001

**Requirement.** This capability governs public form release and custody. The [detailed record rules](docs/contract/record-rules.md#form-001) apply.

**Acceptance.**
1. Autonomous sends record the form credential, principal and current policy versions; internal approvals recheck that credential and policy at their last release.
2. Policy-off/person submissions are unsigned held drafts; switching policy back on never releases them.
3. Only the qualifying form owner confirms eligibility or voids the held draft, with an owner/admin fallback after publisher loss; that fresh personal release retains form provenance and consumes the account send budget.
4. Owner/role/permission loss permanently suspends the form, never transfers or revives it.
5. Statistics contain counts only.
6. Admission PII is purged after 24 hours, hashed IP rate identifiers after one hour, and raw IP/UA appear only in the envelope’s RECORD-002 evidence.
7. Form configuration, permission and rate/admission state are excluded from document archives; the envelope’s form provenance travels with its record.
8. ADMIN-005 inherits form/permission change history before its account audit is complete.

**Evidence.** `tests/web-forms.test.mjs`, `tests/journeys/forms.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Autonomous sends record the form credential, principal and current policy versions; internal approvals recheck that credential and policy at their last release; Policy-off/person submissions are unsigned held drafts; switching policy back on never releases them; Only the qualifying form owner confirms eligibility or voids the held draft, with an owner/admin fallback after publisher loss; that fresh personal release retains form provenance and consumes the account send budget; Owner/role/permission loss permanently suspends the form, never transfers or revives it; Statistics contain counts only; Admission PII is purged after 24 hours, hashed IP rate identifiers after one hour, and raw IP/UA appear only in the envelope’s RECORD-002 evidence; Form configuration, permission and rate/admission state are excluded from document archives; the envelope’s form provenance travels with its record; ADMIN-005 inherits form/permission change history before its account audit is complete.

### Envelope management and reporting

#### MANAGE-001 — Envelope dashboard with search

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Senders see drafts, waiting for me, waiting for others, completed, declined, voided and expired envelopes, search by title, recipient, email and custom field, filter by date, sender, template and status, and page through thousands. A draft is prepared and awaiting approval; waiting for me is the signed-in person's own signing turn (`MANAGE-003`); waiting for others is every other envelope out for signature; an unfinished envelope past its expiry is expired; a person sees only the envelopes their role allows (`ACCESS-001`). The [detailed record rules](docs/contract/record-rules.md#manage-001) apply.

**Acceptance.**
1. with 5,000 envelopes, search by recipient email returns in under one second and each status filter shows the right count.

**Evidence.** `tests/api.test.mjs`, `src/inkwell/search.ts`, `src/ui/operator-app.tsx`, `src/ui/envelope-list.tsx`
**Gap.** None.

#### MANAGE-002 — Folders, tags and custom envelope fields

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Envelopes go into shared folders (shared with people, and with groups once `ADMIN-002` ships, to view or to edit under `ADMIN-001`'s sharing rules, which these shares meet before they ship), carry tags and custom fields (for example deal ID or cost center) that are searchable, reportable and sent to integrations. A folder can carry its own retention rule, which takes the place of the account rule for the envelopes in it under `RECORD-005`'s semantics (warning, purge, legal hold), before folders ship. The [detailed record rules](docs/contract/record-rules.md#manage-002) apply. Placement and inactive restored-folder authority follow MANAGE-006 (RL-102); retention follows RECORD-005 and group sharing follows ADMIN-002.

**Acceptance.**
1. a template adds a required cost-center field; envelopes are filtered and exported by it and the HubSpot fake receives it; with the clock advanced, a folder's three-year rule purges a completed envelope in it after its warning while the account's seven-year rule keeps one outside it.
2. Folders are managed by their creator, an owner or an admin; recipients of edit shares edit envelopes but cannot reshare or move them.
3. Only an owner or admin sets or clears a folder retention rule.
4. Moving a record requires its original sender or an owner or admin, and management authority over the destination folder.
5. Folder shares participate in reads, search, atomic edits and deferred releases; narrowing or removing them permanently suspends affected sender API keys.
6. Folder configuration, shares and their change receipts are installation state and are not restored from document archives; recorded folder IDs grant no access or automatic folder retention in a restored installation.
7. Tags and required custom fields are retained with the envelope and its authenticated preparation or update events, copied and carried into templates; required values are enforced on preparation and draft edits.

**Evidence.** `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs`, `tests/hubspot-envelope.test.mjs`
**Gap.** Ct approval of the conservative folder placement and archive-restore default is pending. Group sharing remains with ADMIN-002.

#### MANAGE-006 — Folder placement and inactive restore

Core · target · **partial** · From MANAGE-002 · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** This capability governs folder placement and inactive restore. The [detailed record rules](docs/contract/record-rules.md#manage-002) apply.

**Acceptance.**
1. Combined templates retain required metadata, with conflicting defaults requiring a value; a public form can be published only after required metadata defaults are set.
2. Folder rules replace account years, including when no account rule exists, and reuse RECORD-005 warnings, legal holds and erasure fences.
3. Groups inherit these rules under ADMIN-002; INTEG-001 must carry custom envelope fields through its HubSpot door before shipping.
4. A move needs the original sender or owner/admin authority and destination management rights. Restored folder identifiers remain historical until current shares and retention are explicitly configured (RL-102).

**Evidence.** `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs`, `tests/hubspot-envelope.test.mjs`
**Gap.** Ct approval of the conservative folder placement and archive-restore default is pending. Group sharing remains with ADMIN-002.

#### MANAGE-003 — Waiting for me

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Team members who must sign or approve envelopes from colleagues see them in a waiting-for-me list and sign inside the app without an email round trip. Any member, whatever their role, signs their own turn this way, and owners and admins also find the prepared envelopes awaiting their approval there, and every named internal approver (`ROUTE-004`) finds the drafts waiting for their decision. The [detailed record rules](docs/contract/record-rules.md#manage-003) apply.

**Acceptance.**
1. an admin is the second signer of a colleague's envelope and signs from the in-app list after the first signer finishes.

**Evidence.** `src/inkwell/own-signing.ts`, `src/inkwell/api.ts`, `src/ui/envelope-detail.tsx`, `tests/api.test.mjs`, `tests/own-signing.test.mjs`
**Gap.** None.

#### MANAGE-004 — Reports and exports

Core · target · **done** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Reports show envelopes sent, completed, declined and expired, time to complete, and per sender and per template turnaround over a date range, with CSV export. A range is whole days in the account's US time zone (America/New_York until `ADMIN-004` lets the owner choose), both days included, at most 731 days. The [detailed record rules](docs/contract/record-rules.md#manage-004) apply.

**Acceptance.**
1. a fixture of 300 envelopes produces the expected counts and median turnaround, and the CSV matches the report.

**Evidence.** `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs`
**Gap.** None.

#### MANAGE-005 — Envelope detail and timeline

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Each envelope has a detail page showing its documents, every recipient's place in routing and timeline (sent, delivered, viewed, authenticated, signed, declined or bounced, with times in the account's US time zone and UTC), what each recipient is waiting on, and the actions available to the viewer (remind, resend, correct, void, copy, download), next to the audit trail. The [detailed record rules](docs/contract/record-rules.md#manage-005) apply.

**Acceptance.**
1. for an envelope with three recipients mid-routing, the detail page at 1440 and 390 pixels shows each recipient's sent, delivered, viewed and signed times matching the provider events (`DELIV-001`) and the audit trail, and its remind action sends one reminder to the current signer only.

**Evidence.** `src/inkwell/timeline.ts`, `src/inkwell/reminders.ts`, `src/ui/envelope-detail.tsx`, `tests/journeys/envelope-detail.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: for an envelope with three recipients mid-routing, the detail page at 1440 and 390 pixels shows each recipient's sent, delivered, viewed and signed times matching the provider events (`DELIV-001`); the audit trail; its remind action sends one reminder to the current signer only.

### Execution evidence

#### RECORD-002 — Per-recipient certificate evidence

Core · target · **done** · Cites BASE-AUDIT-001, BASE-DATA-006

**Requirement.** The certificate of completion lists for every recipient their authentication method and result, IP address, user agent, adopted signature and method, disclosure acceptance, and every timestamp in UTC and the account's US time zone, plus every document's fingerprint. The IP address is the connecting address Cloudflare reports for the request and reads "not recorded" when there is none; the account's US time zone is America/New_York until `ADMIN-004` lets the owner choose another; the result of a code check includes how many incorrect codes are on record. The [detailed record rules](docs/contract/record-rules.md#record-002) apply.

**Acceptance.**
1. complete an envelope with an email-code signer and a member who signs in the app (and SMS-code signers once `IDV-002` ships) and show each item on the certificate matches the audit trail.

**Evidence.** `src/inkwell/certificate.ts`, `src/inkwell/zone.ts`, `tests/api.test.mjs`
**Gap.** None.

#### RECORD-003 — Sealed PDFs

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-006

**Requirement.** The executed PDF carries a PDF digital signature (PAdES) from the installation's signing certificate or a certificate on the Adobe Approved Trust List obtained through a provider, so Adobe Acrobat shows the document as unmodified and any change breaks the seal. The [detailed record rules](docs/contract/record-rules.md#record-003) apply.

**Acceptance.**
1. open the executed PDF in a PDF validator to show a valid seal; modify one byte and show the seal fails.

**Evidence.** None.
**Gap.** No PDF digital seal; the certificate says it is not one

#### RECORD-004 — Public verification

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-006

**Requirement.** Anyone with an executed PDF or certificate uploads it to the installation's verification page and learns whether it matches a completed envelope, without signing in and without revealing other envelopes. The [detailed record rules](docs/contract/record-rules.md#record-004) apply.

**Acceptance.**
1. a signed-out visitor verifies a genuine executed PDF, an altered copy fails, and an unrelated PDF reveals nothing.

**Evidence.** `tests/api.test.mjs`, `tests/runtime.mjs`, `src/inkwell/verification.ts`, `src/ui/public-verify.tsx`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: An unrelated file reports no match..

#### RECORD-005 — Retention and legal hold

Core · target · **done** · Cites BASE-AUDIT-001, BASE-DATA-006

**Requirement.** Account and folder rules purge completed envelopes after a set number of years with notice to admins, and a legal hold stops purge and erasure for named envelopes. The [detailed record rules](docs/contract/record-rules.md#record-005) apply.

**Acceptance.**
1. with the clock advanced, a seven-year rule purges an envelope after its warning, and a held envelope survives both the rule and an erase request.

**Evidence.** `tests/api.test.mjs`, `tests/import-retention.test.mjs`, `tests/journeys/import-retention.mjs`, `src/inkwell/retention.ts`, `src/inkwell/retention-imported-envelope.ts`, `src/inkwell/imports/retention.ts`, `src/inkwell/erasure.ts`, `src/ui/legal-hold.tsx`, `src/ui/account-defaults.tsx`, `src/ui/move-in.tsx`, `migrations/core/0031_retention.sql`, `migrations/core/0032_retention_imports.sql`
**Gap.** None.

### Team administration

#### ADMIN-001 — Roles and envelope sharing

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Built-in roles are owner, admin, sender and viewer, and custom permission profiles refine them (`ADMIN-008`). Senders prepare, send, correct, remind and void their own envelopes and those shared with them for editing, and see those shared with them or their groups; admins see and act on all; viewers only read. The [detailed record rules](docs/contract/record-rules.md#admin-001) apply.

**Acceptance.**
1. a sender sends, corrects and voids their own envelope; two senders cannot see each other's envelopes until one shares the envelope (or, once `MANAGE-002` ships folders, a folder), and a view-only share lets the other read but not void; a viewer can read but not send; the API enforces the same boundaries.

**Evidence.** `src/inkwell/members.ts`, `src/inkwell/shares.ts`, `src/inkwell/api.ts`, `tests/api.test.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: a view-only share lets the other read but not void; the API enforces the same boundaries.

#### ADMIN-002 — Members, groups and departures

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Admins invite, deactivate and re-role members, manage groups, and transfer a departing member's envelopes and templates to someone else without breaking in-flight signing. Groups join `TMPL-002`'s template and folder shares (to use or to edit) and `ADMIN-001`'s envelope and folder shares (to view or to edit, under its rules) when they ship. The [detailed record rules](docs/contract/record-rules.md#admin-002) apply.

**Acceptance.**
1. deactivate a sender with two in-flight envelopes; transfer them; both complete and notify the new owner.

**Evidence.** `src/modules/operator-auth/accounts/admin.mjs`
**Gap.** Invitations and roles from Base; no groups or transfer of a departing member's envelopes

#### ADMIN-003 — SSO and SCIM

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-SIGNIN-001 · Register R-3

**Requirement.** The named identity providers are Auth, Okta, Microsoft Entra ID and Google Workspace. Their admitted members use Inkwell’s current sender, viewer and administrative envelope rights; standards-provider proof and real-tenant qualification remain distinct. The [detailed record rules](docs/contract/record-rules.md#admin-003) apply.

**Acceptance.**
1. through IdP fakes, an OIDC and a SAML sign-in succeed, a SCIM create adds a member and a SCIM deactivate ends their sessions.

**Evidence.** `src/modules/operator-auth/identity/oidc/index.mjs`
**Gap.** OIDC sign-in from Base; no SAML or SCIM

#### ADMIN-004 — Account defaults and sending policies

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Admins set default reminders, expiry, authentication methods (`IDV-001`), allowed signature adoption methods, branding, retention, the consumer disclosure, whether free-form signing is allowed (`PREP-011`) (account-wide, off by default, owner or admin only; its versions fence free-form sends as `PREP-011` states, and group or profile policies narrow it when they ship), whether recipients may reassign their signing (`ROUTE-006`, today chosen per envelope) and sending policies. A sending policy names, for each send source (ad hoc by a person, template, bulk batch, web form, API key or OAuth client, each integration, scheduled), whether it may send without a per-envelope human approval, for which templates and for which groups or permission profiles (`ADMIN-008`), and whether an internal approval (`ROUTE-004`) is required first; policies can be account-wide or per group or profile (for example templates only for one group). The [detailed record rules](docs/contract/record-rules.md#admin-004) apply.

**Acceptance.**
1. change each default and show new envelopes inherit it; a templates-only policy on the Field group refuses an ad hoc upload by its sender while another group's sender can still send ad hoc; a web-form submission sends under the web-form policy and its record names the policy and version; with that policy turned off, the next submission waits for a named person's approval.
2. Settings now edits each source's all/selected template list and optional review reason through the same versioned command, with keyboard controls and persisted choices; an enabled web-form policy requires a nonempty selected list.
3. Template-derived sends also obey SEND-001's live-revision confirmation rule above.
4. Newly prepared records snapshot versioned owner/admin authentication and signature-adoption defaults. Existing records retain their saved choices and evidence (RL-101).
5. An owner/admin disclosure addition preserves the built-in paper-copy, withdrawal, contact and technical requirements; existing accepted disclosures and their fingerprints remain stable (RL-101).

**Evidence.** `src/inkwell/envelope-defaults.ts`, `src/inkwell/send-policy-scopes.ts`, `migrations/core/0048_send_policy_scopes.sql`, `docs/send-policies.md`, `src/ui/account-defaults.tsx`, `src/inkwell/drafts.ts`, `src/inkwell/templates.ts`, `src/inkwell/freeform-policy.ts`, `migrations/core/0035_freeform_policy.sql`, `src/ui/freeform-settings.tsx`, `tests/freeform-policy.test.mjs`, `tests/journeys/freeform-settings.mjs`, `src/inkwell/send-policies.ts`, `migrations/core/0036_send_policies.sql`, `src/ui/send-policies.tsx`, `tests/send-policies.test.mjs`, `tests/journeys/send-policies.mjs`, `src/inkwell/scheduled-approval.ts`, `src/inkwell/send-hold-notices.ts`, `tests/journeys/internal-approval.mjs`
**Gap.** Reminder/expiry/authentication/adoption/reassignment defaults inherited by new envelopes and templates with explicit override and fixed saved-record values; every send-policy save records its version and command receipt, including unchanged values (tests/send-policies.test.mjs). PREP-011 account-wide free-form default, off initially, owner/admin only, versioned with append-only flip history. Per-source account send policies (scope-review-65 A2, A3, A5, A8, A9 for the ad hoc and template sources): opt-in defaults, owner/admin only, 15-minute sign-in for autonomy and widening, immutable versions with before and after, source/principal/versions/fingerprint on the envelope, 403 send_policy_off/send_policy_template/send_policy_deferred, scheduled release and last internal approval held when the policy turns off or narrows, never released by turning it back on; a newly required internal approval moves a scheduled send into the ROUTE-004 wait; every hold notifies its principal and active owners/admins in Activity and by configured email (test ADMIN-004, SEND-001 and ADMIN-004). Gap: branding default is not yet inherited; ct approval of the adopted authentication/adoption snapshot and additive consumer-disclosure defaults is pending; group/profile send constraints and narrowing precedence (A4) are proven by tests/send-policies.test.mjs, while broader group/profile capabilities remain with ADMIN-002/ADMIN-008; BULK-001 now supplies the native batch door under the effective bulk policy; FORM-001 now supplies the autonomous web-form and unsigned policy-off owner-review doors; API-001 now enforces the API source policy and credential at release; the ADMIN-005 log entry waits for that log; template lists and review reasons are editable in Settings; each group/profile source starts with the same approved person/off opt-in defaults as the account, and can never widen it.

#### ADMIN-005 — Account audit log

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Every change to members, roles, groups, settings (including the free-form signing setting, `PREP-011`, whose append-only change records this log adopts), templates, brands, integrations and API keys is recorded with actor, time and before and after values, searchable and exportable to CSV. Scope-review-65 B11: the log also records every key, OAuth, form, webhook and send-policy change (`ADMIN-004`, `API-001`, `FORM-001`, `API-002`), with no secrets; the per-source send-policy versions (before and after values, actor, time, reason) that exist before this log ships appear in it as they do for the free-form setting. The [detailed record rules](docs/contract/record-rules.md#admin-005) apply.

**Acceptance.**
1. change a template, a role and an integration; the log shows all three with before and after values and exports them.

**Evidence.** `tests/account-audit.test.mjs`, `tests/delivery.test.mjs`, `tests/web-forms.test.mjs`, `tests/api-keys.test.mjs`, `tests/send-policies.test.mjs`, `tests/embedding-cases.mjs`, `tests/journeys/account-audit.mjs`
**Gap.** Unified administrative log and CSV now ship; immutable history projections cover shipped policy, permission, form, filing, key, embedding and follow-up families. BLOCKED: the pinned rer 0.2.80 portability policy has no supported append-only custody merge hook; Base refresh is held. Account audit and redaction fences are explicitly excluded from archives to preserve existing PORT-001 restore. The approved audit-history restore and redaction-resurrection fence remain unproved. Broader groups, brands, OAuth and webhooks inherit audit coverage under ADMIN-002, SIGNX-006, API-001 and API-002 before their doors ship.

#### ADMIN-006 — Transparent usage and cost

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** There are no envelope quotas or seat fees from Inkwell; the account shows envelopes sent and provider usage that costs the buyer money (SMS, identity checks, storage, AI) in USD with optional monthly caps that warn and then stop the paid feature. The [detailed record rules](docs/contract/record-rules.md#admin-006) apply.

**Acceptance.**
1. with an SMS cap of 5 USD, sending past the cap warns, then stops SMS codes while email codes continue, and the usage page shows the totals.
2. Implemented conservative controls: only a signed-in owner or admin can view account usage or save a cap, with explicit consent and append-only before and after history.
3. Months use UTC; 80% warns and the next SMS attempt is refused if its approved allowance would exceed the cap.
4. Concurrent dispatches reserve atomically.
5. Every SMS door (codes, resends and follow-up) shares the allowance; all queued SMS work is cancelled rather than released later automatically, with the cap reason visible in message history.
6. Settings retains 80% and 100% threshold notices with the committed amount and cap, including reservations while the provider is still responding, and exposes the append-only setting history with actor, time and before and after amounts.
7. Each threshold also creates one private Activity notice for each active owner or admin; its action opens Usage and cost in Settings directly.
8. Members without a current administrative role cannot read these notices.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/sms.mjs`
**Gap.** Cap controls: owner or admin explicitly approves an allowance per network attempt, UTC calendar months, warning at 80%, atomic reservation before dispatch, no automatic retry of blocked attempts, no automatic authentication downgrade, unpriced and uncertain attempts retain their allowance. The same tests prove in-flight reservations block another signer without authentication downgrade, cancelled invitations remain cancelled after a cap increase, and readable setting history with actor, time and before and after values. The usage journey proves retained 80% and 100% notices, owner Activity notifications with a direct cap-settings action, and readable history at both widths. The existing public tests also prove SMS verification and signing can complete after further paid attempts stop, and cap removal is audited once when its command is replayed. Provider-reported SMS USD charges and reservations are distinguished. Gap: the approved allowance is not a provider-enforced maximum charge; an unexpectedly larger provider receipt can exceed the cap after dispatch. Final provider billing reconciliation, storage and email USD measurement remain unbuilt.

#### ADMIN-010 — Usage report access and accounting

Core · target · **partial** · From ADMIN-006 · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** This capability governs usage report access and accounting. The [detailed record rules](docs/contract/record-rules.md#admin-006) apply.

**Acceptance.**
1. Each network attempt keeps the greater of its allowance and a provider-reported charge, including uncertain outcomes; missing or non-USD prices are shown as unpriced, never free.
2. No recipient is switched to email automatically: existing email recipients continue independently.
3. Inkwell counts native envelopes at actual release, excluding scheduled approvals until release, without envelope quotas.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/sms.mjs`
**Gap.** Cap controls: owner or admin explicitly approves an allowance per network attempt, UTC calendar months, warning at 80%, atomic reservation before dispatch, no automatic retry of blocked attempts, no automatic authentication downgrade, unpriced and uncertain attempts retain their allowance. The same tests prove in-flight reservations block another signer without authentication downgrade, cancelled invitations remain cancelled after a cap increase, and readable setting history with actor, time and before and after values. The usage journey proves retained 80% and 100% notices, owner Activity notifications with a direct cap-settings action, and readable history at both widths. The existing public tests also prove SMS verification and signing can complete after further paid attempts stop, and cap removal is audited once when its command is replayed. Provider-reported SMS USD charges and reservations are distinguished. Gap: the approved allowance is not a provider-enforced maximum charge; an unexpectedly larger provider receipt can exceed the cap after dispatch. Final provider billing reconciliation, storage and email USD measurement remain unbuilt. Identity checks and AI have no connected paid provider yet; IDV-004, IDV-005, PREP-006 and AGENT-008 inherit usage and cap controls before adding one. Storage and email billing and final SMS invoice reconciliation remain gaps, not zero-cost claims.

#### ADMIN-007 — First-day setup and readiness

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** On the buyer's own Cloudflare account, the owner claims the installation and a setup checklist covers the app domain, the sending domain's SPF, DKIM and DMARC records (checked live, showing any record to add), the mail and SMS provider connections with a test message (including adding Amazon SES, Postmark or SMTP sending, each reporting `DELIV-001`'s per-message status before it ships), the identity, payment and AI provider checks the account uses, the brand (`SIGNX-006`) and the consumer disclosure (`SIGNX-005`). A readiness screen shows every check as passing or failing, and the first real send is refused until mail is ready, unless the owner records an explicit override. The [detailed record rules](docs/contract/record-rules.md#admin-007) apply.

**Acceptance.**
1. in a fresh installation the owner claims it; with a DNS fake missing the DKIM record, the readiness screen shows DKIM failing with the exact record to add and a real send is refused; after the record is added the check passes and the send goes.

**Evidence.** `src/base/setup.ts`, `src/base/setup-state.ts`
**Gap.** Owner claim and first-run confirmation only; no domain, SPF, DKIM or DMARC checks, provider tests or readiness gate

#### ADMIN-008 — Custom permission profiles

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001

**Requirement.** Beyond the four built-in roles, admins build permission profiles from named permissions (send ad hoc, send from templates only, bulk send, create and edit templates, manage web forms, correct, void, view every envelope of a group, manage brands, use API keys) and assign them to members or groups; sending policies can apply per profile (`ADMIN-004`), and every authorization check uses the member's effective permissions (`ACCESS-001`). Scope-review-65 gives two permissions their meanings: "use API keys" lets a sender mint keys bound only to themselves, with scopes no wider than their own permissions (`API-001`), and "manage web forms" makes the member the owner and principal of the forms they publish (`FORM-001`). The [detailed record rules](docs/contract/record-rules.md#admin-008) apply.

**Acceptance.**
1. a Templates-only profile assigned to the Field group sends from a template but is refused an ad hoc upload in the UI and the API; a Bulk sender profile can bulk send while a plain sender cannot; changing a profile takes effect on the member's next request and is in the account audit log (`ADMIN-005`).
2. A signed-in owner/admin may grant the current member-level “use API keys” permission through /api/inkwell/api-key-permissions, off when absent, only to an active sender.
3. The grant is versioned with immutable before/after values; a sender may list/manage only self-bound keys and mint only shipped scopes allowed by the current sender role and live record access.
4. Minting, re-scoping and rotation still require a sign-in no older than 15 minutes; the permission version and live role fence the transaction.
5. Losing the grant permanently suspends every bound key; restoring it never revives them.
6. Permission grants and local history are installation state excluded from document archives.
7. Future ADMIN-008 profile permissions must further narrow this gate and permanently suspend keys on authority loss before they ship.

**Evidence.** `src/inkwell/api-key-permissions.ts`, `migrations/core/0051_api_key_permissions.sql`, `tests/api-keys.test.mjs`
**Gap.** API-key self-service permission foundation only: owner/admin grant, sender self binding and live role/scopes, permanent suspension on loss and archive exclusion (tests/api-keys.test.mjs — “API-001: explicit self-service permission lets a sender mint only self-bound keys and permission loss permanently suspends them”). Gap: named permission profiles and member/group assignment, Templates-only and Bulk sender examples, effective permission checks on every door, full permission profiles and ADMIN-005 account audit are unbuilt; explicit member-level manage-web-forms grants now ship with FORM-001 admission Full custom permission profiles and their audit remain unbuilt.

#### ADMIN-009 — Two-factor sign-in for members

Core · target · **missing** · Cites BASE-ROLE-001, BASE-AUDIT-001, BASE-SIGNIN-002

**Requirement.** Native factors protect access to Inkwell’s envelope and account work when the installation does not use SSO; an owner can require a factor without losing the recorded sign-in method on in-app signatures. The [detailed record rules](docs/contract/record-rules.md#admin-009) apply.

**Acceptance.**
1. with the requirement on, a member without a factor must enroll before reaching the app; an authenticator-app sign-in succeeds with the right code and fails with a wrong one; a passkey sign-in succeeds through a WebAuthn virtual authenticator; a recovery code works once and then refuses; the policy change is in the account audit log.

**Evidence.** None.
**Gap.** Email-link and OIDC sign-in only; no passkeys, authenticator codes, recovery codes or two-factor requirement

### Developer platform

#### API-001 — Public REST API

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** A documented OpenAPI REST API with scoped API keys and OAuth 2.0 lets an application create envelopes from templates or files, set recipients, fields and prefill, send, read status, download artifacts, correct, resend, void and list, with idempotency keys and rate limits. A call with the send scope sends immediately under the account's sending policy for API sends, with no per-envelope human approval, and the record names the key or client and the policy (`SEND-001`, `ADMIN-004`). The [detailed record rules](docs/contract/record-rules.md#api-001) apply. Its OpenAPI description includes custom envelope fields and inherited tags and folders, with tag, custom-field and folder filters and the 100-recipient bound.

**Acceptance.**
1. a send-scope call creates an envelope already sent, with no approval step, and its record names the key and the policy; a client creates, sends, polls, downloads and voids envelopes using only the published OpenAPI document; a repeated idempotency key returns the first result; a key without the send scope is refused.
2. Current client doors: a fresh owner/admin session mints a live key bound to an active owner/admin/sender, with a once-visible 256-bit secret, SHA-256-only custody, safe metadata, 365-day default and 730-day maximum expiry, fresh-session re-scoping and rotation with at most seven days of overlap, and immediate revocation.
3. Rotation keeps the original binding, scopes and final expiry.
4. Member version/status/role loss and narrowed or removed sender record shares permanently suspend keys, even if authority is restored before the next call.
5. Keys stay out of installation archives.
6. Public /api/v1 envelope, artifact and template reads require separate scopes and the bound member’s current access; a prepare scope creates unsigned drafts with per-key command receipts even while API send policy is off.
7. A prepare-scope sent-status request is refused with no envelope created.

**Evidence.** `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `src/inkwell/api-limits.ts`, `src/inkwell/api-key-warnings.ts`, `migrations/core/0050_api_key_warnings.sql`, `migrations/core/0049_api_limits.sql`, `tests/journeys/api-capacity.mjs`, `migrations/core/0038_api_keys.sql`, `tests/api-keys.test.mjs`, `tests/api.test.mjs`, `docs/api.md`
**Gap.** Scoped live key custody, freshness, bounded rotation, immediate revoke/permanent suspension, separate read/artifact/template/prepare/send/manage scopes and OpenAPI-driven draft/create/send/read/download/correct/resend/void proof now ship. OpenAPI metadata and filtered client results are also proven by the existing template-client test. Gap: OAuth/PKCE and its consent screen, and ADMIN-005 account audit integration; no test-mode or webhook-manage scope yet. Send/manage scopes, atomic create-and-send, policy/credential release fences, rolling key/account quotas with Retry-After, and 24-hour API-only idempotency now ship, proven by tests/api-keys.test.mjs and the committed outside-Verify quota journey tests/journeys/api-capacity.mjs.

#### API-005 — API creation and live principal authority

Core · target · **partial** · From API-001 · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** This capability governs api capacity and principal accounting. The [detailed record rules](docs/contract/record-rules.md#api-001) apply.

**Acceptance.**
1. An explicit send-scope key under an autonomous effective API policy can atomically create and send from a file or a visible pinned template, with caller-reported prefill; its key/current policy and live member authority are recorded and fenced.
2. Template use access and definition are fenced in that same creation batch.
3. Bearer credentials never borrow a member session for session-only API routes; preparation tokens are refused at the key/client doors.
4. Single-envelope reads use the dashboard’s live expiry, and successful key requests count as authenticated access by the bound member under COMPLY-002; refused calls do not advance access, and credentials and content remain out of logs.

**Evidence.** `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `src/inkwell/api-limits.ts`, `src/inkwell/api-key-warnings.ts`, `migrations/core/0050_api_key_warnings.sql`, `migrations/core/0049_api_limits.sql`, `tests/journeys/api-capacity.mjs`, `migrations/core/0038_api_keys.sql`, `tests/api-keys.test.mjs`, `tests/api.test.mjs`, `docs/api.md`
**Gap.** Scoped live key custody, freshness, bounded rotation, immediate revoke/permanent suspension, separate read/artifact/template/prepare/send/manage scopes and OpenAPI-driven draft/create/send/read/download/correct/resend/void proof now ship. OpenAPI metadata and filtered client results are also proven by the existing template-client test. Gap: OAuth/PKCE and its consent screen, and ADMIN-005 account audit integration; no test-mode or webhook-manage scope yet. Send/manage scopes, atomic create-and-send, policy/credential release fences, rolling key/account quotas with Retry-After, and 24-hour API-only idempotency now ship, proven by tests/api-keys.test.mjs and the committed outside-Verify quota journey tests/journeys/api-capacity.mjs. Remaining gaps: OAuth with PKCE and its consent screen, webhook-management scope, and the ADMIN-005 account audit log. Test-mode keys and SDK coverage are evidenced under API-004.

#### API-006 — Member permission to use API keys

Core · target · **partial** · From API-001 · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** This capability governs api warnings and abuse visibility. The [detailed record rules](docs/contract/record-rules.md#api-001) apply.

**Acceptance.**
1. A signed-in owner/admin may grant the current member-level “use API keys” permission off when absent, only to an active sender.
2. The grant is versioned with immutable before/after values; a sender may list/manage only self-bound keys and mint only shipped scopes allowed by the current sender role and live record access.
3. Minting, re-scoping and rotation still require a sign-in no older than 15 minutes; the permission version and live role fence the transaction.
4. Losing the grant permanently suspends every bound key; restoring it never revives them.
5. Permission grants and local history are installation state excluded from document archives.
6. Future ADMIN-008 profile permissions must further narrow this gate and permanently suspend keys on authority loss before they ship.

**Evidence.** `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `src/inkwell/api-limits.ts`, `src/inkwell/api-key-warnings.ts`, `migrations/core/0050_api_key_warnings.sql`, `migrations/core/0049_api_limits.sql`, `tests/journeys/api-capacity.mjs`, `migrations/core/0038_api_keys.sql`, `tests/api-keys.test.mjs`, `tests/api.test.mjs`, `docs/api.md`
**Gap.** Scoped live key custody, freshness, bounded rotation, immediate revoke/permanent suspension, separate read/artifact/template/prepare/send/manage scopes and OpenAPI-driven draft/create/send/read/download/correct/resend/void proof now ship. OpenAPI metadata and filtered client results are also proven by the existing template-client test. Gap: OAuth/PKCE and its consent screen, and ADMIN-005 account audit integration; no test-mode or webhook-manage scope yet. Send/manage scopes, atomic create-and-send, policy/credential release fences, rolling key/account quotas with Retry-After, and 24-hour API-only idempotency now ship, proven by tests/api-keys.test.mjs and the committed outside-Verify quota journey tests/journeys/api-capacity.mjs. Full custom permission profiles and their audit remain unbuilt.

#### API-007 — API-key expiry warnings

Core · target · **partial** · From API-001 · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** This capability governs api protocol limits. The [detailed record rules](docs/contract/record-rules.md#api-001) apply.

**Acceptance.**
1. The hourly pass sends one durable 30-day and 7-day expiry warning to the currently bound active member, with key name/prefix/last-four/expiry only; listing shows normalized sent/rejected/uncertain outcomes.
2. A claimed warning is never blindly replayed; an interrupted claim becomes uncertain after 10 minutes.

**Evidence.** `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `src/inkwell/api-limits.ts`, `src/inkwell/api-key-warnings.ts`, `migrations/core/0050_api_key_warnings.sql`, `migrations/core/0049_api_limits.sql`, `tests/journeys/api-capacity.mjs`, `migrations/core/0038_api_keys.sql`, `tests/api-keys.test.mjs`, `tests/api.test.mjs`, `docs/api.md`
**Gap.** Scoped live key custody, freshness, bounded rotation, immediate revoke/permanent suspension, separate read/artifact/template/prepare/send/manage scopes and OpenAPI-driven draft/create/send/read/download/correct/resend/void proof now ship. OpenAPI metadata and filtered client results are also proven by the existing template-client test. Gap: OAuth/PKCE and its consent screen, and ADMIN-005 account audit integration; no test-mode or webhook-manage scope yet. Send/manage scopes, atomic create-and-send, policy/credential release fences, rolling key/account quotas with Retry-After, and 24-hour API-only idempotency now ship, proven by tests/api-keys.test.mjs and the committed outside-Verify quota journey tests/journeys/api-capacity.mjs.

#### API-002 — Signed webhooks with retries

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** Webhooks report sent, delivered, viewed, signed, declined, completed, voided, expired, bounced and reminder events, signed with HMAC SHA-256, retried with backoff for 72 hours, logged with every attempt, and replayable; each event has an ID so receivers can deduplicate. Webhook endpoints follow scope-review-65 B10: each has an HMAC secret, shown once and stored encrypted; rotation keeps the old and new secrets valid for 24 hours; only HTTPS endpoints are allowed and private, loopback and link-local addresses are refused; payloads carry IDs and statuses only, never documents. The [detailed record rules](docs/contract/record-rules.md#api-002) apply.

**Acceptance.**
1. a receiver fake fails twice then succeeds; the log shows three attempts; a replay delivers the same event ID; a tampered signature is rejected by the documented verification.
2. API-004 inheritance: production webhook delivery excludes test-mode records before its first door ships.

**Evidence.** None.
**Gap.** No webhooks. The approved resolved-address rule requires Base egress that validates public addresses and connects to a validated address while checking TLS against the endpoint hostname; this pinned edition has no such adapter. Base refresh is outside this candidate. Endpoint custody, event delivery, attempt history, retries and replay remain unbuilt.

#### API-003 — Embedded signing and sending

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** An application embeds signing through a recipient view URL or web component in an iframe, receives postMessage events for signed, declined and closed, and embeds preparing and sending in its own pages, restricted to allowed origins. The [detailed record rules](docs/contract/record-rules.md#api-003) apply.

**Acceptance.**
1. a test page on an allowed origin embeds signing and receives the signed event; an unlisted origin is refused; embedded preparing creates and explicitly sends an envelope.
2. The acceptance journey additionally proves every boundary and rider above, including declined and closed events, at 1440 and 390 for each changed screen.
3. API-001 retains any future scoped external launch-credential door before it ships.
4. The complete API, SDK, webhook, template, bulk, branding and integration targets remain unchanged.

**Evidence.** `tests/journeys/embedding.mjs`, `tests/embedding-cases.mjs`, `tests/embedding-limits.mjs`, `tests/payments-flow.mjs`, `tests/compliance.test.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: a test page on an allowed origin embeds signing and receives the signed event; an unlisted origin is refused; embedded preparing creates and explicitly sends an envelope; The acceptance journey additionally proves every boundary and rider above, including declined and closed events, at 1440 and 390 for each changed screen; API-001 retains any future scoped external launch-credential door before it ships; The complete API, SDK, webhook, template, bulk, branding and integration targets remain unchanged.

#### API-004 — SDKs and test mode

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001, BASE-PUBLIC-002

**Requirement.** JavaScript/TypeScript and Python SDKs cover the API, and a test mode creates watermarked, non-binding envelopes that never count toward usage or reach production integrations. The [detailed record rules](docs/contract/record-rules.md#api-004) apply.

**Acceptance.**
1. the SDK examples run against a test-mode key; test envelopes are watermarked and absent from production reports and webhooks.
2. API-002 retains production webhook exclusion in both documents before its future door ships.

**Evidence.** `tests/test-mode.test.mjs`, `tests/journeys/bulk.mjs`
**Gap.** Unproved: a complete full-history publication scan with NEW 0 for the candidate; main at the candidate SHA; and a green Run site run at that SHA. Production webhook exclusion is retained by API-002 in both documents.

### Integrations

#### INTEG-001 — HubSpot

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** Send from a HubSpot deal or contact with prefilled templates; status, key fields and the completed PDF return to the record and its timeline. HubSpot contacts sync into the contact book (`ROUTE-008`). The [detailed record rules](docs/contract/record-rules.md#integ-001) apply.

**Acceptance.**
1. through a HubSpot fake, send from a deal, complete it and show the deal's properties, timeline event and attached PDF updated once; a contact created in the fake appears in the contact book after sync.

**Evidence.** `tests/hubspot-envelope.test.mjs`, `tests/hubspot-sync.test.mjs`, `tests/journeys/hubspot.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: through a HubSpot fake, send from a deal, complete it; a contact created in the fake appears in the contact book after sync.

#### INTEG-002 — Salesforce

Core · target · **missing** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2

**Requirement.** Send from a Salesforce Opportunity, Account or Contact with merge fields; status and fields write back and the completed PDF attaches to the record's Files. Salesforce contacts sync into the contact book (`ROUTE-008`). The [detailed record rules](docs/contract/record-rules.md#integ-002) apply.

**Acceptance.**
1. through a Salesforce fake, send from an Opportunity, complete it and show field write-back and the attached file; a contact created in the fake appears in the contact book after sync.

**Evidence.** None.
**Gap.** No Salesforce connector

#### INTEG-003 — Orbit

Core · target · **missing** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2

**Requirement.** The same send, prefill and write-back for Orbit deals and contacts through Orbit's API. Orbit contacts sync into the contact book (`ROUTE-008`). The [detailed record rules](docs/contract/record-rules.md#integ-003) apply.

**Acceptance.**
1. through Orbit's API in a test installation, send from a deal and show the completed record on it; a contact created in Orbit appears in the contact book after sync.

**Evidence.** None.
**Gap.** No Orbit connector

#### INTEG-004 — Google Workspace

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** Pick sources from Google Drive and Google Docs (a Google Doc is exported to PDF and converted and fingerprinted as in `PREP-001`), file completed envelopes to a chosen Drive folder per template, and use the Gmail add-on: from an open message with an attachment, see the attachment and the message's participants (sender, To and Cc) proposed as recipients, then send it for signature or sign it yourself (`ROUTE-009`). Connected Gmail reply sources inherit AGENT-003’s grant, authenticated reply intake, contact rules, reply visibility, logging and envelope custody before shipping. The [detailed record rules](docs/contract/record-rules.md#integ-004) apply.

**Acceptance.**
1. through a Google fake, send a Drive document and show the completed PDF and certificate in the configured folder; pick a Google Doc and show it arrives as a converted PDF whose fingerprint the envelope binds; in the Gmail add-on test harness, open a message with a PDF attachment from a client with one person on Cc, see the attachment and both participants proposed as recipients, and send; from another message, sign the attached PDF yourself with no mail sent to you.
2. The contextual Apps Script add-on opens the native preparation door with a message reference and a send or self-sign choice; native review, field placement, eligibility confirmation and recipient authentication remain required.
3. Per-template Drive filing uses explicit administrative consent, verified completed bytes and manual recovery from uncertain uploads.
4. Configured Gmail reply intake verifies Google OIDC caller identity, the exact audience, subscription and mailbox, a fresh push and replay receipts, fetches Gmail history and messages at the network edge, and reuses AGENT-003’s current invitation capability, exact sender, grant, contact, private reply, logging, archive, hold and erasure gates.

**Evidence.** `tests/google.test.mjs`, `tests/journeys/google.mjs`, `tests/delivery.test.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: through a Google fake, send a Drive document; in the Gmail add-on test harness, open a message with a PDF attachment from a client with one person on Cc, see the attachment; both participants proposed as recipients, and send; from another message, sign the attached PDF yourself with no mail sent to you; The contextual Apps Script add-on opens the native preparation door with a message reference; a send or self-sign choice; native review, field placement, eligibility confirmation and recipient authentication remain required; Per-template Drive filing uses explicit administrative consent, verified completed bytes and manual recovery from uncertain uploads; Configured Gmail reply intake verifies Google OIDC caller identity, the exact audience, subscription and mailbox, a fresh push and replay receipts, fetches Gmail history and messages at the network edge, and reuses AGENT-003’s current invitation capability, exact sender, grant, contact, private reply, logging, archive, hold and erasure gates.

#### INTEG-012 — Gmail authenticated reply custody

Core · target · **partial** · From INTEG-004 · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** This capability governs gmail authenticated reply custody. The [detailed record rules](docs/contract/record-rules.md#integ-004) apply.

**Acceptance.**
1. Only recipient-address metadata is fetched before a current reply capability is resolved; message bodies, other headers and attachments are fetched afterward.
2. Credentials, push receipts and the mailbox-bound history cursor are installation state excluded from business archives; restore creates no active reply capability.
3. Provider tokens and Google add-on deployment are installation provisioning, separately from the acceptance fake.

**Evidence.** `tests/google.test.mjs`, `tests/journeys/google.mjs`, `tests/delivery.test.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Only recipient-address metadata is fetched before a current reply capability is resolved; message bodies, other headers and attachments are fetched afterward; Credentials, push receipts; the mailbox-bound history cursor are installation state excluded from business archives; restore creates no active reply capability; Provider tokens and Google add-on deployment are installation provisioning, separately from the acceptance fake.

#### INTEG-005 — Microsoft 365

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** Pick sources from OneDrive and SharePoint and file completed envelopes there; use the Outlook add-in, which from an open message with an attachment shows the attachment and the message's participants (sender, To and Cc) proposed as recipients, then sends it for signature or lets you sign it yourself (`ROUTE-009`); and use the Word add-in, which sends the open document (converted as in `PREP-001`) for signature. Connected Outlook reply sources inherit AGENT-003’s grant, authenticated reply intake, contact rules, reply visibility, logging and envelope custody before shipping. The [detailed record rules](docs/contract/record-rules.md#integ-005) apply.

**Acceptance.**
1. through a Microsoft Graph fake, send a OneDrive document and show the completed record filed in the SharePoint folder; in the Outlook add-in test harness, open a message with a PDF attachment and two participants, see the attachment and both participants proposed as recipients, and send; sign another message's attachment yourself with no mail sent to you; in the Word add-in test harness, send the open document and show the envelope binds the converted PDF's fingerprint.
2. The native Microsoft source door reads OneDrive and SharePoint PDFs, converts Word sources through Graph, and obtains Outlook attachment bytes and the sender, To and Cc participants from Graph.
3. Outlook and Word host harnesses supply the open resource context.
4. Preparation consumes an actor-bound staged source, refuses altered displayed bytes and records the converted PDF fingerprint.
5. A selected filing template must contain that exact PDF.
6. The Microsoft source policy starts off, and every send retains native human eligibility confirmation, current policy versions, internal approval and deferred-release fences.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/microsoft.mjs`
**Gap.** Owner and admin connection authority is a conservative default awaiting an unprovided ruling. Signed Graph subscription notification intake, installed Office registration, conversion download redirects and complete mutation and lifecycle rider proof remain unproved. Live Microsoft tenant provisioning is a separate operation, not claimed by Graph-fake evidence.

#### INTEG-013 — Microsoft completed-record filing

Core · target · **partial** · From INTEG-005 · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** This capability governs microsoft reply intake. The [detailed record rules](docs/contract/record-rules.md#integ-005) apply.

**Acceptance.**
1. SharePoint filing uses the existing explicitly consented per-template queue, deterministic filenames and remote byte verification; uncertain or conflicting copies stay visible until a manual retry.
2. Filing rules and credentials remain installation state; restoring business records starts no external transfer.
3. Remote copies remain outside local erasure.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/microsoft.mjs`
**Gap.** Owner and admin connection authority is a conservative default awaiting an unprovided ruling. Signed Graph subscription notification intake, installed Office registration, conversion download redirects and complete mutation and lifecycle rider proof remain unproved. Live Microsoft tenant provisioning is a separate operation, not claimed by Graph-fake evidence. The existing delivery tests additionally prove source retention after draft edits and copies, source-bound staged upload preparation with template approval and policy-off refusal, mixed-source refusal, exact-byte preparation above the legacy inline limit, and capability-free reply attachment metadata.

#### INTEG-014 — Microsoft reply-source authority

Core · target · **partial** · From INTEG-005 · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** This capability governs microsoft connection authority. The [detailed record rules](docs/contract/record-rules.md#integ-005) apply.

**Acceptance.**
1. Only a signed-in owner or admin may read the installation's connected Microsoft drive or mailbox.
2. Source loading and reply intake require explicit native actions; no automatic mailbox subscription or outbound reply is enabled.
3. Recipient self-signing remains the member's own native session.
4. Explicit Outlook reply intake fetches Graph facts, requires a fresh current reply capability and authorized reply reader, refuses replays, and uses AGENT-003's existing grant, contact, pause, visibility, no-text audit, archive and erasure rules.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/microsoft.mjs`
**Gap.** Owner and admin connection authority is a conservative default awaiting an unprovided ruling. Signed Graph subscription notification intake, installed Office registration, conversion download redirects and complete mutation and lifecycle rider proof remain unproved. Live Microsoft tenant provisioning is a separate operation, not claimed by Graph-fake evidence. Signed Microsoft subscription notification intake and installed Office registration remain unproved. INTEG-005 stays partial until CT approves the connection-authority default and the remaining gaps are proved.

#### INTEG-006 — Box and Dropbox

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** File completed envelopes automatically to a Box or Dropbox folder per template. The [detailed record rules](docs/contract/record-rules.md#integ-006) apply.

**Acceptance.**
1. through Box and Dropbox fakes, a completion files the PDF and certificate once each, and a retry does not duplicate.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/filing.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: through Box and Dropbox fakes, a completion files the PDF and certificate once each; a retry does not duplicate.

#### INTEG-007 — Chest

Core · target · **missing** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2

**Requirement.** Pick sources from Chest and file completed envelopes to a Chest folder. The [detailed record rules](docs/contract/record-rules.md#integ-007) apply.

**Acceptance.**
1. in a test installation of Chest, a completion appears in the configured Chest folder with its fingerprint.

**Evidence.** None.
**Gap.** No Chest connector

#### INTEG-008 — Locket handoff

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2

**Requirement.** Locket starts signature for an approved contract revision, and the completed record (documents, certificate, parties, signing dates and fingerprints) is delivered to Locket's repository, which records it against that revision. Objections routed to Locket inherit AGENT-003’s grant, pause, reply readers and envelope custody before shipping. The [detailed record rules](docs/contract/record-rules.md#integ-008) apply.

**Acceptance.**
1. a Locket-initiated envelope completes and Locket shows the executed record against the approved revision; a downloaded handoff manifest still verifies offline.

**Evidence.** `src/inkwell/envelopes.ts`, `tests/api.test.mjs`
**Gap.** Downloadable handoff manifest only; no delivery to Locket

#### INTEG-009 — Zapier, Make, Power Automate, n8n and Crank

Core · target · **missing** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** Published apps expose triggers (envelope sent, completed, declined, voided) and actions (send from template, find envelope, download), built on the API and webhooks. The [detailed record rules](docs/contract/record-rules.md#integ-009) apply.

**Acceptance.**
1. each app's test harness triggers on a completion and sends from a template.

**Evidence.** None.
**Gap.** No automation apps

#### INTEG-010 — Payment at signing through Stripe

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-9

**Requirement.** A template can require a payment, deposit, saved card or ACH mandate when the signer signs, collected through the buyer’s Stripe account using Payment Element or Checkout. The envelope completes only after Stripe confirms the required outcome. The [detailed record rules](docs/contract/record-rules.md#integ-010) apply. The interim Stripe route follows RL-8: test-mode hosted Checkout, separate consent by the assigned authenticated signer, frozen requirements and reference-only custody; restored references carry no active collection authority. The complete Payment Element, refund, dispute, receipt, tax, recurring and live-mode target remains required.

**Acceptance.**
1. in Stripe test mode, a signer pays a 500 USD deposit and the envelope completes with the payment reference; a declined card leaves the envelope waiting with the signature unsaved.

**Evidence.** `tests/payments-flow.mjs`, `tests/journeys/payments.mjs`, `tests/payment-sandbox.mjs`
**Gap.** BLOCKED sandbox dependency: a Checkout-capable Stripe test account. The held account rejects a correctly formed 500 USD card Checkout request with HTTP 400 on payment_method_types; its default test payment-method configuration reports card available and on, so no missing native foundation is claimed. Both original real-sandbox acceptance points remain unproved. CT-approved test-mode-only, explicit-consent and reference-only custody defaults are adopted. Payment Element, refunds and disputes handling, receipts, tax, recurring billing handoff to Nectar and live mode remain named Gaps; ASK INTEG-010-scope retains partial status pending their disposition.

#### INTEG-011 — Signing service for sibling products

Core · target · **partial** · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2

**Requirement.** Platter, Lodge, Willow, Terrace and other Run Edit Run products send their documents through Inkwell's API and receive the completed record through webhooks, each with its own scoped key, sending under the account's sending policy for that key with no per-envelope human approval (`SEND-001`). The [detailed record rules](docs/contract/record-rules.md#integ-011) apply.

**Acceptance.**
1. a Lodge-style client sends an offer letter from a template with no approval step, the record names its key and the policy, and the client receives the completion webhook and executed PDF.

**Evidence.** `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `tests/api-keys.test.mjs`
**Gap.** Scoped clients can send files or templates autonomously under the shared API-source policy and read artifacts. No sibling-specific integration policy sources or completion webhooks; the Lodge-style end-to-end callback journey is unbuilt.

#### INTEG-015 — Authorized HubSpot contact sync

Core · target · **partial** · From INTEG-001 · Cites BASE-DATA-004, BASE-OPS-003 · Rules D-2 · Register R-10

**Requirement.** Native owner or admin authorization defines one complete HubSpot contact import or recurring sync by connected account, authorizing member, records or filters, imported properties, mapping, shared contact book, update behavior and cadence. Widening needs a new authorization; the stated contact-book audience remains owners, admins and senders. It grants no envelope access, signing consent, sending authority or follow-up authority (RL-9).

**Acceptance.**
1. One scoped import spans several provider pages, interrupts and resumes, reconciles every selected contact without duplicates and does not ask for consent again for each page.
2. An authorized recurring sync retains source record identity; conflicting local edits are reported, and absence from a provider page never silently deletes a local contact.
3. Every continuation checks the current authorization, authorizing member and connector credential before reads and commits. Revocation or authority loss prevents the next page’s reads and writes; restoring authority does not revive the authorization.
4. Unconsented or unauthorized preparation and sync are refused. An ineligible CRM owner gains neither envelope access nor a follow-up grant.
5. The audit retains the exact authorization scope, version, actor, time and outcome without credentials or imported field values in operational logs. Restored prepared provenance does not restore connector authority.
6. The connector’s configuration, launch and progress screens expose page and record counts, failures and remaining work at both required widths.

**Evidence.** `tests/hubspot-envelope.test.mjs`, `tests/hubspot-sync.test.mjs`, `tests/journeys/hubspot.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: One scoped import spans several provider pages, interrupts and resumes, reconciles every selected contact without duplicates and does not ask for consent again for each page; An authorized recurring sync retains source record identity; conflicting local edits are reported, and absence from a provider page never silently deletes a local contact; Every continuation checks the current authorization, authorizing member and connector credential before reads and commits. Revocation or authority loss prevents the next page’s reads and writes; restoring authority does not revive the authorization; Unconsented or unauthorized preparation and sync are refused. An ineligible CRM owner gains neither envelope access nor a follow-up grant; The audit retains the exact authorization scope, version, actor, time and outcome without credentials or imported field values in operational logs. Restored prepared provenance does not restore connector authority; The connector’s configuration, launch and progress screens expose page and record counts, failures and remaining work at both required widths.

### Mobile

#### MOBILE-001 — Responsive sending and tracking

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001

**Requirement.** Senders send from templates, track status, remind, correct and void from a phone browser at 390 pixels, with the app installable as a PWA. A phone browser here is a 390 by 844 pixel touch screen at 3x density; each of those screens (the Templates send form, the envelope list, the envelope detail page with its status, timeline, Remind, Correct and Void actions, and the correction screen) works there by touch without sideways scrolling. The [detailed record rules](docs/contract/record-rules.md#mobile-001) apply.

**Acceptance.**
1. at 390 pixels, send from a template, remind a signer and void an envelope.

**Evidence.** `public/manifest.webmanifest`, `src/routes/__root.tsx`, `src/ui/templates.tsx`, `public/app/shell.css`, `tests/journeys/mobile-sending.mjs`, `tests/journeys/correct-envelope.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: The phone journey sends from a template..

#### MOBILE-002 — Native iOS and Android apps

Core · target · **missing** · Cites BASE-ACCESSIBILITY-001 · Register R-4, R-5

**Requirement.** Native apps sign, send from templates, track and remind, receive push notifications, and scan paper pages with the camera into a PDF to send. The [detailed record rules](docs/contract/record-rules.md#mobile-002) apply.

**Acceptance.**
1. on iOS and Android simulators, sign a received envelope with a drawn signature using guided Next; send from a template, track its recipients and send a reminder; scan a two-page document and send it; and receive a push notification on each signature and on completion.

**Evidence.** None.
**Gap.** No native apps

### Migration and portability

#### MOVE-002 — Docusign move-in

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Through the Docusign eSignature REST API with the buyer's OAuth grant, Inkwell imports completed, declined and voided envelopes with their documents, certificates of completion, recipients and custom fields; templates with roles, fields, routing and their shared folders; signing groups with their members (`ROUTE-005`); and the account's address book (`ROUTE-008`). Ownership carries over: Docusign users are matched to Inkwell members by email, each imported envelope belongs to its original sender and stays private to them under `ADMIN-001` (and shared as it was in Docusign), each template keeps its owner, and each shared folder keeps its people, groups and use or edit permissions (`TMPL-002`). The [detailed record rules](docs/contract/record-rules.md#move-002) apply.

**Acceptance.**
1. through a Docusign API fake with two senders, 50 envelopes, five templates in a shared folder, two signing groups and 120 contacts, preview and import; each sender sees only their own imported envelopes in the UI and API while an admin sees all; the shared folder's settings carry over, so a member with use access can send from a template but not edit it; an imported signing group sends as one recipient; contacts autocomplete; a third Docusign user with no member is on the unmapped list and their envelopes belong to the named admin; open an imported certificate and send from an imported template; the unmapped list names each skipped field type; the fake's PowerForm arrives as a web form whose page and the cutover checklist show the old PowerForm URL beside the new link, and a signed-out submission to the new link sends an envelope; the fake's brand, custom disclosure, default reminder and expiry settings and a saved bulk-send list arrive, and the next envelope and bulk batch use them.

**Evidence.** None.
**Gap.** No Docusign import

#### MOVE-003 — Adobe Acrobat Sign move-in

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Agreements with their audit reports and library templates import through the Acrobat Sign API with the same preview, unmapped list, ownership mapping by email as `MOVE-002`, and the throttled, resumable job of `MOVE-008`. Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules. The [detailed record rules](docs/contract/record-rules.md#move-003) apply.

**Acceptance.**
1. through an Acrobat Sign API fake with two senders, import agreements and a library template, show each sender owns only their own agreements, and send from the template.

**Evidence.** `tests/remote-import.test.mjs`, `tests/journeys/remote-import.mjs`, `src/inkwell/remote-import.ts`, `src/inkwell/remote-import-provider.ts`
**Gap.** Reviewed batches import terminal records and mapped one-PDF signature and text templates, preserve sender custody, send through native template review, and assert imported retention, hold, erasure and restore fencing. Remaining: account-wide preview and the throttled background job promised by MOVE-008, durable continuation across grant expiry, pause and cancel controls, provider limit-header accounting and scale proof. Other field types remain explicitly unmapped. Acrobat roles use documented field assignees and source owner email; Dropbox template ownership is known only when the credential account is the creator, otherwise the reviewed fallback administrator is used. Dropbox template fields without page metadata are mapped only for one-document, single-page PDFs; broader placement remains unmapped.

#### MOVE-004 — Dropbox Sign move-in

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Signature requests with their files and audit trails and templates import through the Dropbox Sign API, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`. Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules. The [detailed record rules](docs/contract/record-rules.md#move-004) apply.

**Acceptance.**
1. through a Dropbox Sign API fake with two senders, import requests and templates, show each sender owns only their own requests, and send from one.

**Evidence.** `tests/remote-import.test.mjs`, `tests/journeys/remote-import.mjs`, `src/inkwell/remote-import.ts`, `src/inkwell/remote-import-provider.ts`
**Gap.** Reviewed batches import terminal records and mapped one-PDF signature and text templates, preserve sender custody, send through native template review, and assert imported retention, hold, erasure and restore fencing. Remaining: account-wide preview and the throttled background job promised by MOVE-008, durable continuation across grant expiry, pause and cancel controls, provider limit-header accounting and scale proof. Other field types remain explicitly unmapped. Acrobat roles use documented field assignees and source owner email; Dropbox template ownership is known only when the credential account is the creator, otherwise the reviewed fallback administrator is used. Dropbox template fields without page metadata are mapped only for one-document, single-page PDFs; broader placement remains unmapped.

#### MOVE-005 — Documenso move-in

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Documents with their audit logs and templates import from Documenso's API or export, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`. Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules. The [detailed record rules](docs/contract/record-rules.md#move-005) apply.

**Acceptance.**
1. through a Documenso fake with two senders, import documents and a template, show each sender owns only their own documents, and send from it.

**Evidence.** None.
**Gap.** No Documenso import

#### MOVE-006 — Cutover of in-flight envelopes

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Envelopes still waiting in the incumbent at cutover are listed under their mapped sender and tracked read-only until they complete there, then imported automatically; nothing is re-sent to signers. Tracking uses the incumbent's completion webhooks (Docusign Connect) where the grant allows and otherwise polls no more often than the incumbent permits (`MOVE-008`). The [detailed record rules](docs/contract/record-rules.md#move-006) apply.

**Acceptance.**
1. a fake with two in-flight envelopes; one completes after cutover and is imported under its sender, the other is voided upstream and is listed as voided; the fake's call log shows neither envelope polled twice within 15 minutes.

**Evidence.** None.
**Gap.** No in-flight cutover

#### MOVE-007 — API compatibility for common calls

Core · target · **missing** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** A compatibility layer accepts the most common Docusign and Dropbox Sign API calls (create from template, create and send in one call, status, download, void, and completion webhooks shaped as Docusign Connect messages and Dropbox Sign callbacks) so an existing integration switches by changing its base URL, key and webhook secret. A create call with status sent sends straight away under the account's sending policy for API sends (`SEND-001`, `ADMIN-004`). The [detailed record rules](docs/contract/record-rules.md#move-007) apply.

**Acceptance.**
1. a client written against the incumbent's documented requests runs unchanged against the compatibility layer for create, create-and-send, status, download and void; a listener written for Docusign Connect receives a Connect-shaped completion message (envelope and recipient statuses, and the documents when configured) whose HMAC signature header its existing verification accepts; a listener written for Dropbox Sign callbacks receives a callback-shaped signature-request-all-signed event and accepts it the same way.

**Evidence.** None.
**Gap.** No API compatibility layer

#### MOVE-008 — Throttled, resumable imports at account size

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-006, BASE-ROLE-001 · Rules D-2

**Requirement.** Every API import (`MOVE-002` to `MOVE-006`) runs as a background job sized for real accounts (tens of thousands of envelopes over many years). It stays under the incumbent's published limits, reading the limit headers (for Docusign, the account's hourly limit, 3,000 calls by default, and the burst limit, and never polling one resource more than once every 15 minutes); on a rate-limit response (`HOURLY_APIINVOCATION_LIMIT_EXCEEDED`, HTTP 429) it pauses until the window resets. The [detailed record rules](docs/contract/record-rules.md#move-008) apply.

**Acceptance.**
1. a Docusign fake with 18,000 envelopes and a 3,000-call hourly limit, with the clock advanced: the import returns the hourly-limit error mid-import, pauses, resumes after the window and finishes; the job is killed mid-batch and resumed, and exactly 18,000 envelopes exist with no duplicates; the fake's call log shows no hour over the limit and no resource polled twice within 15 minutes.

**Evidence.** `src/inkwell/imports/index.ts`, `src/modules/import-kit/src/d1/index.ts`
**Gap.** Checkpointed, resumable apply for archive imports only; no remote API pull, rate-limit pause or duplicate-free resume of a remote import

#### PORT-002 — Self-service export at any size

Core · target · **partial** · Cites BASE-DATA-001, BASE-BACKUP-001

**Requirement.** Admins export all or selected envelopes as PDFs, certificates, audit JSON and a CSV index, streamed in chunks without the 24 MiB browser limit, and a whole-installation archive restores at that size. The [detailed record rules](docs/contract/record-rules.md#port-002) apply.

**Acceptance.**
1. export 2 GB of envelopes, interrupt and resume, and restore into an empty installation with every fingerprint verified.

**Evidence.** `tests/supplements.test.mjs`, `tests/api.test.mjs`, `tests/journeys/supplements.mjs`, `tests/journeys/archive-capacity.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Every restored fingerprint is present and verified..

### Compliance profiles

#### COMPLY-001 — 21 CFR Part 11 signing profile

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Register R-6

**Requirement.** An optional profile for life-science buyers requires re-authentication at each signature, a signing reason, the signature manifestation (printed name, date and meaning) on the document, and a validation package: installation, operational and performance qualification (IQ, OQ and PQ) scripts with their executed results for the installed version, a traceability matrix from each Part 11 requirement (11.10, 11.50, 11.70, 11.100, 11.200 and 11.300) to the feature and test that meets it, and the change log since the last validated version. Signing door (ct 22 Oct): each Part 11 signature requires two distinct components. The [detailed record rules](docs/contract/record-rules.md#comply-001) apply.

**Acceptance.**
1. with the profile on, a signer re-authenticates and picks a reason; the executed PDF shows the manifestation; the validation package for the installed version contains IQ, OQ and PQ scripts with executed results, and every traceability-matrix row cites a test that passed in that run.

**Evidence.** `tests/compliance.test.mjs`, `tests/journeys/healthcare.mjs`, `scripts/qualify-part11.mjs`, `docs/part11/traceability.md`
**Gap.** Signing door (ct 22 Oct): each Part 11 signature requires two distinct components. The first signature in a session uses a credential the signer alone holds (password, passkey or OIDC tied to a verified Inkwell identity) plus the fresh emailed code. Later signatures in the same continuous session require at least the fresh code. A recipient with no such identity is refused in this profile with 'Part 11 signing needs a verified signer account', never downgraded. Meanings: Approval, Review, Responsibility, Authorship, plus owner-defined meanings recorded with their text. An admin verifies a signer's identity, and records the method, before that signer's first Part 11 signature. A locked-out or exhausted code notifies the owner/admin security contact within one minute and is listed. The organization's FDA certification under 11.100(c) is recorded with its date and reference. 'Validated' means only this: IQ/OQ/PQ executed on the installed version, every matrix row (11.10(a)-(k), 11.30, 11.50, 11.70, 11.100, 11.200, 11.300) citing a test that passed in that run, and a change log since the last validated version. Procedural controls (11.10(i), (j)) are the customer's and are listed in the matrix as theirs. Implemented semantics: frozen owner/admin per-draft opt-in, with no removal through edits/copies/templates; paper signing refused; a fresh recipient/link/session-bound code at each signature (10 minutes, five attempts, 60-second spacing, ten requests per link); verified printed name and exact meaning in PDF/certificate and immutable signature evidence. Independent password identity sessions grant no app access and last at most 24 hours; hosted termination revokes them. Account identity/version, current status, credential session and code are fenced in the signing transaction. Legacy signed records preserve their original proof and are never retroactively qualified. Enrollment and recovery (ct 22 Oct, approved as implemented): an owner or admin other than the signer verifies the signer's identity and records the method; this issues a one-use activation token, valid for 24 hours, shown only to that verifier for separate trusted delivery and never emailed automatically. Separate delivery is the verifier's responsibility. The signed-in, verified account holder chooses a separate 15–128 character signer password, stored salted with PBKDF2-SHA256 at 600,000 iterations. Recovery requires fresh admin reverification and a new activation token; reverification immediately revokes the old password, any unused token and every identity session. Identity sessions last at most 24 hours. The per-account password bucket counts all authentication attempts, including successful attempts, in fixed ten-minute windows aligned to Unix time. An incorrect or exhausted attempt at count five or greater records a security alert and attempts mandatory email to active owner/admin security contacts; attempts after five are refused even with the correct password. A correct fifth attempt succeeds. The bucket resets at the next fixed boundary, not ten minutes after the last failure; up to ten attempts within the two five-attempt allowances can fall around a boundary. These lifetimes, lengths, hash parameters, attempt/code limits and the one-minute alert target are Inkwell product choices, not numeric requirements set by 21 CFR Part 11. Password aging and periodic credential review under 11.300(b) remain the customer's procedure. Only the owner defines custom meanings. docs/part11/README.md, docs/part11/traceability.md and scripts/qualify-part11.mjs provide the qualification procedure, complete requirement inventory and exact-candidate technical receipts; a passing technical phase never labels an installation validated. Gap: Customer-installed IQ/OQ/PQ execution and reviewed passing evidence for every matrix row, customer procedural controls, installed real-provider one-minute alert receipt, OIDC composition qualification and a reviewed change log from the last validated version remain unproved. No qualification or certification is claimed.

#### COMPLY-002 — HIPAA-ready installation

Core · target · **partial** · Cites BASE-ROLE-001, BASE-AUDIT-001 · Register R-7

**Requirement.** Healthcare buyers can run Inkwell with logging that excludes document content, access reviews, and a documented shared-responsibility guide for their Cloudflare account; a business associate agreement is the buyer's arrangement with their providers. The owner or admin enables the healthcare profile in Settings and reviews every member, including invited and inactive members, with their current role, status and last successful authenticated request (HTTP status below 400, stored in UTC, displayed in the reviewer's local time); no recorded access is explicit. The [detailed record rules](docs/contract/record-rules.md#comply-002) apply.

**Acceptance.**
1. in the profile, logs contain no field values or document text after a full signing journey, and the access review report lists every member's last access.

**Evidence.** `tests/compliance.test.mjs`, `tests/journeys/healthcare.mjs`, `src/inkwell/compliance/profile.ts`, `src/inkwell/compliance/requests.ts`, `src/ui/healthcare.tsx`, `docs/healthcare.md`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Every active member has the expected last-access evidence..

### Agents that carry the agreement

#### AGENT-001 — Assemble the envelope from CRM and email context

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** From a request such as “send the MSA to Acme” or a deal-stage change, the agreement specialist selects the approved template and proposes roles, fields and signatories from Orbit, HubSpot or Salesforce and a granted Gmail or Outlook thread. Values carry their source and confidence; unsourced values stay empty. Preparation carries standard, sending carries external, and binding decisions carry commitment; the company’s risk policy decides each call. The [detailed record rules](docs/contract/record-rules.md#agent-001) apply.

**Acceptance.**
1. from a CRM-fake deal and email-fake thread, the agent drafts an envelope whose prefilled values each cite their source; the sender edits one and sends; a request with no matching template is refused with a reason.

**Evidence.** `src/inkwell/agents.ts`, `tests/api.test.mjs`
**Gap.** Agents prepare envelopes for human approval; no CRM or email context assembly

#### AGENT-002 — Fill what is missing

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The specialist detects missing parties, fields, attachments and inconsistent entity names, titles or W-9s. It asks the appropriate sender, colleague or recipient one specific question and merges answers with provenance. Internal drafting carries standard, outside questions carry external, and changed material terms carry commitment; the company’s risk policy decides each step. The [detailed record rules](docs/contract/record-rules.md#agent-002) apply.

**Acceptance.**
1. Under the held company policy, a draft missing the client signer’s title and W-9 produces questions to the correct people, merges both answers with their sources, and flags a reply changing the price for the policy’s commitment decision.

**Evidence.** `tests/agent-workflows.test.mjs`, `docs/agent-workflows.md`
**Gap.** Adopted conservative default awaiting an unprovided ruling: received W-9 PDFs are private source custody for current editors, never automatically signer-visible supplements. Missing-party discovery, arbitrary missing fields and CRM entity inconsistency detection remain unimplemented. Native HTTP doors ship; no new operator controls or live mailbox qualification is claimed.

#### AGENT-003 — Chase stalled signers under the sender's rules

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The specialist distinguishes bad addresses, unavailable signers and substantive objections using delivery, signing and granted reply records. Follow-up observes the sender’s channels, contact limits, quiet hours and escalation owner; substantive objections go to the sender or Locket. Sending outside carries external and changing agreement terms carries commitment; the company’s risk policy decides those calls. Detailed reply identity and custody rules govern every connected mailbox. The [detailed record rules](docs/contract/record-rules.md#agent-003) apply.

**Acceptance.**
1. three stalled signers (bounce, out-of-office until Monday, reply objecting to a clause); under the company’s external-class contact policy the agent proposes a corrected address, waits until Monday, and routes the objection to the sender, staying within the contact limit.

**Evidence.** `tests/delivery.test.mjs`, `tests/journeys/envelope-detail.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: three stalled signers (bounce, out-of-office until Monday, reply objecting to a clause); under the company’s external-class contact policy the agent proposes a corrected address, waits until Monday, and routes the objection to the sender, staying within the contact limit.

#### AGENT-004 — Verify the intended revision and parties

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** Before sending and at completion, the specialist compares each page to the approved Locket or template revision, checks every required party’s entity and capacity, and checks required fields for completeness and plausibility. A mismatch produces an exception with evidence. Releasing a binding exception carries commitment under the company’s risk policy; a completed record remains immutable. The [detailed record rules](docs/contract/record-rules.md#agent-004) apply.

**Acceptance.**
1. Under the held company policy, a changed second page stops sending and shows the differing text; a completed envelope signed without the required authority raises an exception and holds the downstream handoff.

**Evidence.** `src/inkwell/envelopes.ts`
**Gap.** Signers sign the approved fingerprinted bytes; no comparison with an external approved revision or signer-authority check

#### AGENT-005 — Complete the downstream work

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** After verified completion, the specialist updates the CRM deal stage, files the record in Locket and the file store, and creates the next onboarding or invoice-draft task in Nectar, Pantry or Willow. Each effect has a receipt and runs once. Outside handoffs carry external; charges carry money and binding terms carry commitment. The company’s risk policy decides each call within the granted systems, fields and task types. The [detailed record rules](docs/contract/record-rules.md#agent-005) apply.

**Acceptance.**
1. a completion produces one deal update, one filed record and one onboarding task through fakes; a replayed webhook creates nothing new; a person-declined grant leaves its effect open with the reason.

**Evidence.** None.
**Gap.** No downstream effects

#### AGENT-006 — Keep integrations correct

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The specialist reconciles webhook and connector state against Inkwell records, detects renamed CRM fields, moved folders and expired tokens, and proposes mapping repairs without duplicate remote effects. Internal repairs carry standard, outside replays carry external and credential changes carry security; the company’s risk policy decides scope changes and repairs. An uncertain remote outcome remains unresolved until evidence establishes it. The [detailed record rules](docs/contract/record-rules.md#agent-006) apply.

**Acceptance.**
1. Rename a CRM field in the fake; the specialist detects the failed write-backs and proposes a new mapping. Under the held company policy, the authorized person approves the repair and replay creates no duplicate.

**Evidence.** `tests/hubspot-envelope.test.mjs`, `tests/delivery.test.mjs`, `tests/journeys/hubspot.mjs`, `tests/journeys/filing.mjs`, `tests/journeys/account-audit.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: Rename a CRM field in the fake; the specialist detects the failed write-backs and proposes a new mapping. Under the held company policy, the authorized person approves the repair and replay creates no duplicate.

#### AGENT-007 — Keep templates current

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The specialist proposes template revisions from repeated sender corrections, new IRS W-9 revisions and changed company addresses. Suggestions cite the supporting envelopes and show the old and proposed definitions. Publishing an internal reusable template carries standard, and changing binding terms carries commitment; the company’s risk policy decides each call through the normal template validator. The [detailed record rules](docs/contract/record-rules.md#agent-007) apply.

**Acceptance.**
1. After ten envelopes receive the same added field, a suggestion cites all ten examples. Under the held company policy, the template owner reviews the diff and publishes version 2.

**Evidence.** `src/inkwell/template-maintenance.ts`, `src/ui/template-maintenance.tsx`, `tests/template-maintenance.test.mjs`, `tests/journeys/template-maintenance.mjs`
**Gap.** Carried evidence contains the assertions indexed in docs/contract/DONE-AUDIT.md. Unasserted outcomes: After ten envelopes receive the same added field, a suggestion cites all ten examples. Under the held company policy, the template owner reviews the diff and publishes version 2.

#### AGENT-008 — Signer assistant

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The signer assistant explains fields in English or Spanish and answers questions with the visible document’s page and passage. It gives no legal advice. Questions remain private unless that signer shares them. Reading regulated identity or payment facts carries sensitive, outside sharing carries external, and an agent’s own binding act carries commitment under the company’s risk policy; it cannot impersonate the signer. The [detailed record rules](docs/contract/record-rules.md#agent-008) apply.

**Acceptance.**
1. A signer asks the termination notice period and receives an answer citing the page; a request to sign as that person is refused; the sender cannot see the question unless the signer sends it.

**Evidence.** None.
**Gap.** No signer assistant

#### AGENT-009 — Inbound agreements

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008 · Rules D-3

**Requirement.** The specialist reads forwarded agreements and requests from other agreement platforms, identifies the internal signer by business role, prepares their signing and tracks the request. The inbound source follows the authenticated reply and record-custody rules of AGENT-003. Preparation carries standard, returning the executed record carries external and signing carries commitment; the company’s risk policy decides an agent’s calls, and a person’s signature comes from that person’s session. The [detailed record rules](docs/contract/record-rules.md#agent-009) apply.

**Acceptance.**
1. Forward a vendor NDA; the specialist identifies the internal signer by role and prepares it. After the signer signs, return the executed copy within the grant and the company’s external-class policy.

**Evidence.** `tests/agent-workflows.test.mjs`, `docs/agent-workflows.md`
**Gap.** Adopted conservative default awaiting an unprovided ruling: owner-maintained business-role mapping, exact approved forwarder, and a separate owner return action under the current grant. Automatic organizational-role inference and intake from other agreement platforms remain unimplemented. Native HTTP doors ship; no new operator controls or live mailbox qualification is claimed.

## Agent surface

### Agent surface

#### SURFACE-001 — Discoverable agreement jobs

Agent surface · target · **missing** · From new · Cites BASE-AGENT-001, BASE-AGENT-002, BASE-AGENT-013 · Register R-11

**Requirement.** Discoverable agreement jobs for Inkwell’s agreement specialist.

**Acceptance.**
1. The registry’s Core-clause mapping equals the tool table and the listed device, screen and installation reasons.
2. The agreement specialist’s prompts expose prepare-and-route, recover-a-stalled-agreement and verify-and-file jobs.
3. The generated agent documentation names the agreement resources, events and capacity limits in this surface.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-002 — Standard agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Standard agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. An internal draft field update carries standard with the envelope and affected item count.
2. The same update when it makes content visible to an outside recipient adds external, with that recipient and counterparty facts.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-003 — External agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** External agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Sending to an existing business contact carries external with a known counterparty and exact recipient count.
2. Sending to an address without a business contact carries external with a new counterparty; publishing a signing link carries external with a public counterparty.
3. Filing an executed record to a connected outside store, and sending agreement content to an outside model, each carry external.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-004 — Money agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Money agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Starting a frozen 500 USD Stripe deposit carries money with 500 USD, the immutable requirement and Stripe as counterparty.
2. Saved-card and ACH-mandate calls carry their frozen requirement kind and do not invent a collected amount.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-005 — Commitment agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Commitment agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. An agent’s own signature carries commitment with the frozen agreement revision, entity and counterparty.
2. Publishing a template change that alters a binding material term carries commitment; a reversible internal layout-only change carries standard.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-006 — Gated agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Gated agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. A provider requiring hosted card entry, identity verification or account consent adds gated with the actual provider and step.
2. An agent-capable provider route receives the company’s disposition for its computed classes.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-007 — Access agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Access agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Adding a sender, widening an envelope edit share or widening a recipient delegation carries access with direction widens.
2. Revoking a member, share or grant carries access with direction narrows and the affected people or grants.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-008 — Security agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Security agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Changing a provider credential, native factor or protective signing configuration carries security with the setting or connection identity.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-009 — Destructive agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Destructive agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Voiding an unfinished envelope and erasing an eligible completed record carry destructive with the affected item count.
2. Moving a reversible draft to a different internal folder carries standard.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-010 — Sensitive agreement calls

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Sensitive agreement calls for Inkwell’s agreement specialist.

**Acceptance.**
1. Reading a W-9 tax identifier, identity-verification result or healthcare agreement carries sensitive with the record count and data kind.
2. Sending that same regulated record outside adds external with the actual recipient and counterparty.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-011 — Agreement resources and change events

Agent surface · target · **missing** · From new · Cites BASE-AGENT-003, BASE-AGENT-010

**Requirement.** Agreement resources and change events for Inkwell’s agreement specialist.

**Acceptance.**
1. Envelope, template, recipient, contact, folder, signing-group, form, batch, import-job, record, integration, follow-up and policy resources have the URI templates listed here.
2. An envelope send, signature, correction, completion, failed delivery, reply, import and downstream handoff expose the corresponding typed event and record resource.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-012 — Agreement handoffs and pending work

Agent surface · target · **missing** · From new · Cites BASE-AGENT-010, BASE-AGENT-012

**Requirement.** Agreement handoffs and pending work for Inkwell’s agreement specialist.

**Acceptance.**
1. A CRM deal-stage or Locket revision event identifies the agreement task and its source resource.
2. Completion emits the verified execution record for Orbit, Locket, Chest, Lodge, Willow, Terrace, Nectar or Pantry; a failed effect remains visible with its receipt and recovery path.
3. A substantive objection emits an escalation to the sender or Locket with the permitted reply resource.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

#### SURFACE-013 — A specialist’s seeded week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-013

**Requirement.** A specialist’s seeded week for Inkwell’s agreement specialist.

**Acceptance.**
1. Given only the installation URL, a stranger agent prepares from a CRM deal and email thread, fills the missing title and W-9, routes the agreement, follows up on a bounced and an unavailable signer, verifies the completed revision and files the record.
2. Under a company policy autonomous for every declared class, every policy-permitted call runs without a person’s policy approval or review hold. Provider steps that require a person remain truthful handoffs.
3. Under the held company policy, standard calls enter review and every other declared class awaits the person the policy names; approved saved actions run once.
4. The same week before policy setup returns the setup question without changing agreement records.

**Evidence.** None.
**Gap.** The shared MCP registry, server class computation and company-policy conformance journey are not implemented.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass | SIGNX-003 | not run | | |
| R-2 | VPAT | SIGNX-003 | not run | | |
| R-3 | Okta, Entra and Google Workspace tenant qualification | ADMIN-003 | not run | | |
| R-4 | iOS store approval | MOBILE-002 | not run | | |
| R-5 | Android store approval | MOBILE-002 | not run | | |
| R-6 | Purchaser qualification and legal suitability of a real regulated installation | COMPLY-001 | not run | | |
| R-7 | Provider business-associate agreements and healthcare legal review | COMPLY-002 | not run | | |
| R-8 | Live identity-provider operation and legal suitability | IDV-001, IDV-002, IDV-003, IDV-004, IDV-006, IDV-007, IDV-008, IDV-005, IDV-009, IDV-010, IDV-011, IDV-012 | not run | | |
| R-9 | Live Stripe account operation and payment qualification | INTEG-010 | not run | | |
| R-10 | Live CRM, mail, storage and automation tenant qualification | INTEG-001, INTEG-004, INTEG-012, INTEG-005, INTEG-013, INTEG-014, INTEG-006, INTEG-009, INTEG-015 | not run | | |
| R-11 | Claude, ChatGPT, Codex and Copilot client receipts | SURFACE-001 | not run | | |
