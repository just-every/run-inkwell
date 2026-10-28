Old reference: `dd4fa16e1fe4075c776411349f067f15ac9c7e81`.

| Clause | Point | Outcome | Asserting test | Result |
| --- | --- | --- | --- | --- |
| HTTP-001 | 1 | Deployment fingerprint is exposed.. | `tests/runtime.mjs:32` | asserted |
| HTTP-001 | 1 | Deployment source is exposed.. | `tests/runtime.mjs:32` | asserted |
| HTTP-001 | 1 | Deployment version is exposed.. | `tests/runtime.mjs:32` | asserted |
| HTTP-001 | 1 | The application document is served.. | `tests/runtime.mjs:36` | asserted |
| HTTP-001 | 1 | Unknown routes return 404.. | `tests/runtime.mjs:38` | asserted |
| ACCESS-001 | 1 | Signed-out, viewer, sender, admin, owner and agent-token authority agrees with the declared matrix at every document, import, agent and archive door.. | none | none |
| ACCESS-001 | 1 | The sender prepares, sends and voids their own envelope.. | none | none |
| ACCESS-001 | 1 | Another sender’s unshared envelope is refused.. | none | none |
| ACCESS-001 | 1 | Cross-origin changes are refused.. | none | none |
| SEND-001 | 1 | prepare an envelope through the API. | none | none |
| SEND-001 | 1 | an ad hoc approval without the eligibility confirmation is refused and one with it sends. | none | none |
| SEND-001 | 1 | a `FORM-001` submission. | none | none |
| SEND-001 | 1 | an `API-001` send-scope call each produce a sent envelope with no human approval step. | none | none |
| SEND-001 | 1 | each record names the sending policy and credential that allowed it. | none | none |
| SEND-001 | 1 | with the policy for API sends turned off, the same call is refused. | none | none |
| SEND-001 | 1 | after signer 1 signs, a `DELIV-006` correction of signer 2's email succeeds and is audited, while any change to signer 1's signed field, direct or through a correction, is refused. | none | none |
| SEND-001 | 2 | preparation freezes the bytes and sending definition at the pinned template version. | none | none |
| SEND-001 | 3 | Each eligibility confirmation records that template ID, pinned version and then-live revision, including its approval rule and sending-policy version. | none | none |
| SEND-001 | 4 | Every immediate release, scheduled dispatch and last ROUTE-004 approval fences that live revision in the invitation batch. | none | none |
| SEND-001 | 5 | Any intervening edit, new version, rule or sending-policy change, disablement or deletion holds the draft and revokes unused signing links. | none | none |
| SEND-001 | 5 | restoring an earlier state never releases it. | none | none |
| SEND-003 | 1 | A current editor's fresh confirmation may release the unchanged older frozen definition and bytes, recording the new confirmer and time and re-snapshotting the live revision. | none | none |
| SEND-003 | 1 | it never adopts newer template content. | none | none |
| SEND-003 | 2 | Preparing a newer definition requires a new draft version and confirmation. | none | none |
| SEND-003 | 3 | Deletion keeps the frozen approval rule and never changes a sent envelope. | none | none |
| SIGN-001 | 1 | Two email-code signers verify their codes.. | none | none |
| SIGN-001 | 1 | A wrong code is refused.. | none | none |
| SIGN-001 | 1 | Signing out of turn is refused.. | none | none |
| SIGN-001 | 1 | Both signers consent and sign in order.. | `tests/api.test.mjs:125` | asserted |
| SIGN-001 | 1 | The second invitation appears only after the first signature.. | `tests/api.test.mjs:488` | asserted |
| SIGN-001 | 1 | A link-only recipient signs without a code.. | `tests/api.test.mjs:503` | asserted |
| SIGN-001 | 1 | Both order-1 recipients can sign in parallel.. | `tests/api.test.mjs:486` | asserted |
| SIGN-001 | 1 | Order 2 waits for both order-1 signatures.. | `tests/api.test.mjs:488` | asserted |
| SEND-002 | 1 | The sender voids their own sent envelope.. | `tests/api.test.mjs:80` | asserted |
| SEND-002 | 1 | Another sender’s unshared envelope is refused and unchanged.. | none | none |
| SEND-002 | 1 | The voided invitation link refuses.. | `tests/api.test.mjs:81` | asserted |
| SEND-002 | 1 | The pending message is cancelled.. | `tests/api.test.mjs:82` | asserted |
| DELEGATE-001 | 1 | A preparation-only token prepares an envelope and refuses actions outside its grant: sending, signing and reading archives. | none | none |
| DELEGATE-001 | 2 | Revoking that preparation token prevents its next use. | none | none |
| DELEGATE-001 | 3 | Under the held company policy, a person releases the prepared envelope. | none | none |
| DELEGATE-001 | 3 | its audit trail identifies the agent as preparer and that person as approver. | none | none |
| RECORD-001 | 1 | Completion produces every downloadable artifact.. | none | none |
| RECORD-001 | 1 | Original and executed document fingerprints reconcile with stored values.. | `tests/api.test.mjs:133` | asserted |
| RECORD-001 | 1 | The audit event chain is independently recomputed.. | none | none |
| RECORD-001 | 1 | The handoff manifest reconciles every fingerprint with the downloaded artifacts.. | none | none |
| MOVE-001 | 1 | The DocuSeal preview creates no import job.. | `tests/api.test.mjs:792` | asserted |
| MOVE-001 | 1 | An incorrect fingerprint refuses import.. | none | none |
| MOVE-001 | 1 | The import records preserve provider custody.. | none | none |
| MOVE-001 | 1 | Every import journal entry and its fields reconcile throughout preview, apply and undo.. | none | none |
| MOVE-001 | 1 | Downloaded provider artifacts have the expected fingerprints.. | `tests/api.test.mjs:799` | asserted |
| MOVE-001 | 1 | Undo removes the imported record and retains the journal.. | `tests/api.test.mjs:810` | asserted |
| PORT-001 | 1 | Exported archive contents are validated.. | `tests/api.test.mjs:823` | asserted |
| PORT-001 | 1 | A populated installation refuses replacement.. | `tests/api.test.mjs:823` | asserted |
| PORT-001 | 1 | Fresh restore recovers the executed file with its fingerprint.. | `tests/api.test.mjs:832` | asserted |
| PORT-001 | 1 | Fresh restore recovers the certificate with its fingerprint.. | `tests/api.test.mjs:832` | asserted |
| PORT-001 | 1 | The full import journal reconciles every entry and field after restore.. | none | none |
| ERASE-001 | 1 | Erased signed files are absent from the artifact door.. | `tests/api.test.mjs:840` | asserted |
| ERASE-001 | 1 | Erased identity custody is absent from all records.. | none | none |
| ERASE-001 | 1 | A later erasure journal prevents resurrection from an older archive.. | `tests/api.test.mjs:841` | asserted |
| ERASE-001 | 1 | Surviving custody reconciles across export, restore and export.. | `tests/api.test.mjs:856` | asserted |
| PREP-002 | 1 | send an envelope with a service agreement, a W-9. | none | none |
| PREP-002 | 1 | a view-only policy. | none | none |
| PREP-002 | 1 | two signers complete it in one session each. | none | none |
| PREP-002 | 1 | the record contains three executed documents, a combined PDF and one certificate covering all three fingerprints. | none | none |
| PREP-004 | 1 | The checked box reveals two required fields.. | none | none |
| PREP-004 | 1 | Unchecking permits completion with both fields absent.. | none | none |
| PREP-004 | 1 | The calculated total updates live.. | none | none |
| PREP-004 | 1 | The calculated total prints in the executed PDF.. | `tests/api.test.mjs:1199` | asserted |
| PREP-005 | 1 | At both widths, pointer placement preserves twelve fields across three pages.. | `tests/journeys/field-placement.mjs:49` | asserted |
| PREP-005 | 1 | At both widths, keyboard placement preserves the fields across pages.. | `tests/journeys/field-placement.mjs:49` | asserted |
| PREP-005 | 1 | Duplicating to every page preserves positions.. | none | none |
| PREP-005 | 1 | Reassigning two fields changes both recipients.. | `tests/journeys/field-placement.mjs:119` | asserted |
| PREP-005 | 1 | Saving preserves every field and its geometry.. | `tests/journeys/field-placement.mjs:50` | asserted |
| PREP-005 | 2 | Drag, resize, duplicate, align and reassign join `SIGNX-003`'s accessibility scan and keyboard-only journey (with a keyboard way to do each) before they ship. | `tests/journeys/field-placement.mjs:119` | asserted |
| PREP-007 | 1 | Text tags prepare with no manual placement.. | `tests/document-fields.test.mjs:50` | asserted |
| PREP-007 | 1 | The fillable IRS W-9 prepares with no manual placement.. | `tests/document-fields.test.mjs:75` | asserted |
| PREP-007 | 1 | W-9 named fields accept API prefill.. | `tests/document-fields.test.mjs:75` | asserted |
| PREP-008 | 1 | The template accepts a HubSpot-fake deal supplied as API prefill.. | none | none |
| PREP-008 | 1 | Company prefill and its reported source are retained.. | `tests/prefill.test.mjs:47` | asserted |
| PREP-008 | 1 | Address prefill and its reported source are retained.. | `tests/prefill.test.mjs:48` | asserted |
| PREP-008 | 1 | Amount prefill and its reported source are retained.. | `tests/prefill.test.mjs:30` | asserted |
| PREP-008 | 1 | A locked amount cannot be changed by the signer.. | `tests/prefill.test.mjs:30` | asserted |
| PREP-009 | 1 | Reopening the saved draft preserves its edited fields and private messages.. | `tests/api.test.mjs:663` | asserted |
| PREP-009 | 1 | The scheduled send records the exact next-business-day Chicago 09:00 time.. | `tests/api.test.mjs:672` | asserted |
| PREP-009 | 1 | No invitation is sent before that scheduled time.. | `tests/api.test.mjs:675` | asserted |
| PREP-009 | 1 | The scheduled pass sends the envelope.. | `tests/api.test.mjs:677` | asserted |
| PREP-009 | 1 | The first recipient sees only their own private message.. | `tests/api.test.mjs:679` | asserted |
| PREP-009 | 1 | The second recipient sees only their own private message.. | `tests/api.test.mjs:680` | asserted |
| PREP-010 | 1 | Copying a completed envelope creates an unsigned draft.. | `tests/api.test.mjs:161` | asserted |
| PREP-010 | 1 | Copied recipients match the source.. | `tests/api.test.mjs:162` | asserted |
| PREP-010 | 1 | Copied fields match the source.. | `tests/api.test.mjs:163` | asserted |
| PREP-010 | 1 | Signed values are absent from the copy.. | `tests/api.test.mjs:162` | asserted |
| PREP-010 | 1 | Sending the copy records the source envelope.. | `tests/api.test.mjs:168` | asserted |
| PREP-011 | 1 | send a one-page letter with no fields to one signer. | none | none |
| PREP-011 | 1 | the signer places a signature. | none | none |
| PREP-011 | 1 | a date on page 1 and finishes. | none | none |
| PREP-011 | 1 | the executed PDF shows both at the places chosen. | none | none |
| PREP-011 | 1 | finishing with no signature placed is refused. | none | none |
| PREP-011 | 1 | with the setting off, sending without fields is refused in the UI and API. | none | none |
| TMPL-001 | 1 | The three-role template sends twice to different people.. | `tests/api.test.mjs:899` | asserted |
| TMPL-001 | 1 | Every inherited field and placement matches the template.. | `tests/api.test.mjs:885` | asserted |
| TMPL-001 | 1 | The role routing matches the template.. | `tests/api.test.mjs:883` | asserted |
| TMPL-001 | 1 | The reminders match the template.. | `tests/api.test.mjs:885` | asserted |
| TMPL-001 | 1 | The expiry matches the template.. | `tests/api.test.mjs:888` | asserted |
| TMPL-002 | 1 | The shared template is listed and used.. | `tests/api.test.mjs:969` | asserted |
| TMPL-002 | 1 | A user with use access cannot edit it.. | none | none |
| TMPL-002 | 1 | An editor changes the shared template.. | `tests/api.test.mjs:974` | asserted |
| TMPL-002 | 1 | A member without access cannot find it through the API.. | `tests/api.test.mjs:963` | asserted |
| TMPL-002 | 1 | A member without access cannot find it through the UI.. | `tests/api.test.mjs:963` | asserted |
| TMPL-003 | 1 | send from version 1, edit the template, send again. | `tests/api.test.mjs:931` | asserted |
| TMPL-003 | 1 | the first envelope still shows version 1 fields. | `tests/api.test.mjs:931` | asserted |
| TMPL-003 | 1 | the second version 2. | `tests/api.test.mjs:932` | asserted |
| TMPL-003 | 1 | saving the first as a template reproduces its fields and roles. | `tests/api.test.mjs:940` | asserted |
| TMPL-003 | 2 | SEND-001 also pins prepared and held envelopes to their older bytes and definition. | none | none |
| TMPL-003 | 2 | a template edit requires fresh eligibility confirmation at release, and that confirmation never substitutes the newer template content. | none | none |
| TMPL-004 | 1 | an NDA template (role Client, order 1). | none | none |
| TMPL-004 | 1 | a W-9 template (role Client, order 1) go out as one envelope. | none | none |
| TMPL-004 | 1 | the client signs both in one session. | none | none |
| TMPL-004 | 1 | the certificate lists both template versions. | none | none |
| TMPL-004 | 1 | a third template whose Client role sits at order 2 is shown as a separate recipient in the preview before sending. | none | none |
| TMPL-004 | 1 | when the W-9 template requires an SMS code. | none | none |
| TMPL-004 | 1 | the NDA an email code, the preview names the conflict and proposes the SMS code. | none | none |
| TMPL-005 | 1 | A fresh copy of the W-9 is offered the matching template.. | `tests/api.test.mjs:1000` | asserted |
| TMPL-005 | 1 | Applying the offer places every template field.. | none | none |
| TMPL-005 | 1 | An unrelated agreement is offered no template.. | `tests/api.test.mjs:1001` | asserted |
| ROUTE-001 | 1 | send to eight signers, one approver, one form filler and three copy recipients, where signer 1 must have a witness. | none | none |
| ROUTE-001 | 1 | each sees only their own actions. | none | none |
| ROUTE-001 | 1 | signer 1 nominates a witness who is invited only after signer 1 signs and before order 2. | none | none |
| ROUTE-001 | 1 | copy recipients receive only the completed record. | none | none |
| ROUTE-002 | 1 | The stored routing orders are 1, 2, 2 and 3.. | `tests/api.test.mjs:224` | asserted |
| ROUTE-002 | 1 | Both order-2 recipients are invited together after order 1.. | `tests/api.test.mjs:214` | asserted |
| ROUTE-002 | 1 | Order 3 is not invited after only one order-2 signature.. | `tests/api.test.mjs:219` | asserted |
| ROUTE-002 | 1 | Order 3 is invited after both order-2 signatures.. | `tests/api.test.mjs:221` | asserted |
| ROUTE-003 | 1 | two envelopes from one template with amounts of 5,000 and 25,000 USD. | none | none |
| ROUTE-003 | 1 | only the second routes to the finance director. | none | none |
| ROUTE-003 | 1 | the first's certificate names the skipped step. | none | none |
| ROUTE-003 | 1 | its rule. | none | none |
| ROUTE-003 | 1 | a copy recipient whose rule is an amount over 10,000 USD gets the completed copy only from the 25,000 envelope, the 5,000 certificate names the skipped copy. | none | none |
| ROUTE-003 | 1 | its rule. | none | none |
| ROUTE-003 | 1 | a copy whose source is missing at completion is sent and recorded as "rule unresolved, copy sent". | none | none |
| ROUTE-003 | 1 | the routing preview shows the skip before sending. | none | none |
| ROUTE-004 | 1 | An above-threshold envelope waits for its internal approver.. | none | none |
| ROUTE-004 | 1 | Rejection returns an editable draft with the entered reason.. | none | none |
| ROUTE-004 | 1 | The final approval sends the envelope.. | none | none |
| ROUTE-005 | 1 | A three-member signing group occupies one place.. | none | none |
| ROUTE-005 | 1 | One member completes that group place.. | none | none |
| ROUTE-005 | 1 | The remaining links show completion and refuse further signing.. | none | none |
| ROUTE-005 | 1 | The certificate names the actual signer.. | none | none |
| ROUTE-005 | 1 | The certificate names the group.. | none | none |
| ROUTE-006 | 1 | a signer reassigns to a colleague. | none | none |
| ROUTE-006 | 1 | the colleague verifies and signs. | none | none |
| ROUTE-006 | 1 | the original link refuses. | none | none |
| ROUTE-006 | 1 | a disallowed reassignment is refused. | none | none |
| ROUTE-007 | 1 | an admin hosts an in-person signer at 768 pixels, the signer signs. | none | none |
| ROUTE-007 | 1 | the certificate records the host, the attestation. | none | none |
| ROUTE-007 | 1 | the device. | none | none |
| ROUTE-007 | 1 | the same preparation, attestation, signing and return to sign-in work at 1440 and 390 pixels, with direct transport assertions of the identity and session boundaries. | none | none |
| ROUTE-008 | 1 | import 200 contacts from CSV and autocomplete a recipient by company. | `tests/api.test.mjs:700` | asserted |
| ROUTE-008 | 2 | The book is one per account: owners, admins and senders read, add, change, remove and import contacts, and viewers and agent tokens cannot (`ACCESS-001`). | `tests/api.test.mjs:695` | asserted |
| ROUTE-008 | 3 | A contact is one email, kept in lower case, with a name (up to 160 characters). | `tests/api.test.mjs:701` | asserted |
| ROUTE-008 | 3 | an optional phone (digits, spaces, brackets, dots or dashes with an optional leading +, up to 40 characters) and company (up to 160). | `tests/api.test.mjs:701` | asserted |
| ROUTE-008 | 3 | saving or importing an email already in the book updates that contact. | `tests/api.test.mjs:701` | asserted |
| ROUTE-008 | 4 | A CSV import is UTF-8 text up to 1 MiB whose first row names the columns, name and email and optionally phone and company in any order (other columns are ignored), then up to 1,000 rows. | `tests/api.test.mjs:701` | asserted |
| ROUTE-008 | 4 | each invalid row is reported with its line number. | none | none |
| ROUTE-008 | 4 | nothing of it is saved. | none | none |
| ROUTE-013 | 1 | While preparing, the sender searches the book by name, email or company (case-insensitive, contains) and adds a contact as a signer or as a copy recipient. | `tests/api.test.mjs:701` | asserted |
| ROUTE-013 | 1 | with nothing typed they see their recent recipients, the last 20 different signers and copy recipients on envelopes they prepared, newest first, with the book's company. | `tests/api.test.mjs:700` | asserted |
| ROUTE-013 | 2 | Contacts are installation state and do not travel in an archive. | none | none |
| ROUTE-013 | 3 | Syncing from the CRM arrives with the CRM connectors: `INTEG-015`, `INTEG-002` and `INTEG-003` each bring their contacts into this book before they ship. | none | none |
| ROUTE-009 | 1 | A member completes a three-page self-signed PDF.. | `tests/api.test.mjs:590` | asserted |
| ROUTE-009 | 1 | Self-signing produces no mail.. | `tests/api.test.mjs:591` | asserted |
| ROUTE-009 | 1 | The certificate names session authentication and the sign-in method.. | `tests/api.test.mjs:593` | asserted |
| ROUTE-009 | 1 | The member downloads the executed PDF.. | `tests/api.test.mjs:594` | asserted |
| ROUTE-009 | 1 | The member downloads the certificate.. | `tests/api.test.mjs:593` | asserted |
| ROUTE-009 | 1 | Two addresses receive the completed copy.. | `tests/api.test.mjs:597` | asserted |
| ROUTE-009 | 1 | The second document reuses the saved signature without another adoption.. | `tests/api.test.mjs:603` | asserted |
| ROUTE-009 | 1 | The sender signs at order 1 inside the app.. | `tests/api.test.mjs:608` | asserted |
| ROUTE-009 | 1 | Order 2 is invited only after that in-app signature.. | `tests/api.test.mjs:609` | asserted |
| ROUTE-009 | 2 | Here the sender is the member who approves: every first-order recipient whose email is theirs is left out of the invitations and signs in the app, so a self-signed envelope (approved, then signed by its only recipient) sends no message. | `tests/api.test.mjs:591` | asserted |
| ROUTE-009 | 2 | the envelope's own sender is never emailed its completed copy because their account files it (`DELIV-007`). | none | none |
| ROUTE-009 | 3 | The certificate states the session's sign-in method as Inkwell records it: an emailed invitation link, an emailed sign-in link, owner setup, single sign-on (OIDC), a password, local development sign-in or review sign-in. | `tests/api.test.mjs:593` | asserted |
| ROUTE-009 | 3 | passkeys and second factors are added to it by `ADMIN-009` before it ships. | none | none |
| ROUTE-014 | 1 | The saved signature is the typed name a member last signed with through their session. | `tests/api.test.mjs:603` | asserted |
| ROUTE-014 | 1 | it is offered for their next in-app signing, and signing with another replaces it. | none | none |
| ROUTE-014 | 1 | the record and certificate say when it was reused. | none | none |
| ROUTE-014 | 2 | The completed copy goes to 1–20 more people, within the envelope's 20 copy recipients, by whoever may change the envelope, through `DELIV-007`'s delivery. | none | none |
| ROUTE-014 | 2 | the record names who sent it. | none | none |
| ROUTE-014 | 3 | Saved signatures are installation state and do not travel in an archive. | `tests/api.test.mjs:603` | asserted |
| ROUTE-010 | 1 | signer 1 nominates a witness while signing. | none | none |
| ROUTE-010 | 1 | the witness is invited only after signer 1 signs. | none | none |
| ROUTE-010 | 1 | order 2 waits for the witness. | none | none |
| ROUTE-010 | 1 | the witness verifies, sees only signer 1's document. | none | none |
| ROUTE-010 | 1 | their own fields, not a document visible only to signer 2, and signs. | none | none |
| ROUTE-010 | 1 | the certificate names the witness against signer 1. | none | none |
| ROUTE-010 | 1 | nominating the signer's own email as witness is refused. | none | none |
| ROUTE-010 | 1 | a declining witness returns the step to signer 1, who nominates another. | none | none |
| ROUTE-012 | 1 | an envelope with an offer letter. | none | none |
| ROUTE-012 | 1 | a compensation memo for the hiring manager: the candidate never sees the memo while signing, in downloads, in their completed copy or through the API recipient view. | none | none |
| ROUTE-012 | 1 | the manager sees and signs both. | none | none |
| ROUTE-012 | 1 | the certificate lists each recipient's visible documents. | none | none |
| ROUTE-012 | 2 | Hidden documents cannot contain that signer’s fields or a required signature for them. | none | none |
| ROUTE-012 | 3 | The owner/admin’s versioned envelope-default setting can narrow selected audiences to recipients with fields when a draft or template is saved or used. | none | none |
| ROUTE-012 | 3 | a copy recipient has no fields and then receives only a scoped certificate. | none | none |
| ROUTE-012 | 4 | Existing saved records and sent envelopes keep their visibility. | none | none |
| ROUTE-012 | 5 | Signing views and PDFs use consecutive visible-page numbers, mapped back to canonical pages for fields, progress and comments. | none | none |
| ROUTE-012 | 6 | Per-document URL guesses are refused, and recipient certificates omit hidden document names and field evidence while the record-holder certificate lists every recipient’s visible documents. | none | none |
| ROUTE-012 | 7 | Page threads cannot be shared with a recipient who cannot see their document. | none | none |
| ROUTE-016 | 1 | A paper scan accompanies a recipient bundle only when every document its uploader could see is visible to that recipient. | none | none |
| ROUTE-016 | 1 | recipient component downloads exclude any scan whose uploader could see a hidden document, while the record holder retains the full original component and scan record. | none | none |
| ROUTE-016 | 2 | Corrections preserve the signer place’s grant and reindex copy grants by the existing copy email. | none | none |
| ROUTE-016 | 2 | new corrected copy recipients receive no restricted documents. | none | none |
| ROUTE-016 | 3 | A sender’s explicit post-completion copy action chooses its documents (all by default), with the audience change audited. | none | none |
| ROUTE-016 | 4 | Draft edits, copies, template save/use/edit, archive verification, holds, retention and erasure carry the same scope. | none | none |
| SIGNX-001 | 1 | a signer completes a ten-field, five-page envelope at 390 pixels using only Next, leaves halfway, returns and finishes. | none | none |
| SIGNX-001 | 1 | the journey records time to first page under 3 seconds on a throttled mobile profile. | none | none |
| SIGNX-001 | 2 | Start, then each Next, goes to the next of the signer's required fields still empty in reading order (by page, then top to bottom, then left to right), scrolls the document to it and puts its entry at the foot of the screen. | none | none |
| SIGNX-001 | 2 | after the last, Next goes to the consent. | none | none |
| SIGNX-001 | 3 | Every required placed field is included. | none | none |
| SIGNX-001 | 3 | optional fields (`PREP-003`) and fields a signer places themselves (`PREP-011`) join Next. | none | none |
| SIGNX-001 | 3 | the count before they ship. | none | none |
| SIGNX-001 | 4 | The count reads how many of the signer's required fields are complete and how many are left. | none | none |
| SIGNX-001 | 5 | Each Next, and Finish later, saves the signer's entries on the server. | none | none |
| SIGNX-001 | 5 | reopening the same link (after the same verification as signing: the 24-hour signing session, or a new code) brings them back, and Start resumes at the first empty field. | none | none |
| SIGNX-010 | 1 | Saved entries sign nothing, are not evidence and are not archived. | none | none |
| SIGNX-010 | 1 | they are cleared when the signer signs, electronically or on paper, or the envelope is declined or voided. | none | none |
| SIGNX-010 | 2 | Pages appear as each one loads and are drawn only near the screen, at the screen's pixel density up to 3x. | none | none |
| SIGNX-002 | 1 | one signer draws on a touch screen, another types. | `tests/api.test.mjs:415` | asserted |
| SIGNX-002 | 1 | a third uploads. | `tests/api.test.mjs:412` | asserted |
| SIGNX-002 | 1 | all three appear in the executed PDF. | `tests/api.test.mjs:381` | asserted |
| SIGNX-002 | 1 | the certificate records each method. | `tests/api.test.mjs:381` | asserted |
| SIGNX-002 | 2 | The executed PDF carries that mark in every signature field: a typed name in its style, or the image centered in the field and scaled to fit with its proportions kept. | `tests/api.test.mjs:415` | asserted |
| SIGNX-002 | 3 | A signer who adopts nothing is typed in Sans italic, as every envelope signed before adoption existed was. | `tests/api.test.mjs:415` | asserted |
| SIGNX-002 | 4 | The mark is adopted at signing: Finish later (`SIGNX-001`) keeps the names entered but not the adopted mark. | none | none |
| SIGNX-002 | 5 | The record keeps the method, the typed style or the image's type and SHA-256. | `tests/api.test.mjs:415` | asserted |
| SIGNX-002 | 5 | the image itself with the envelope's documents (so it travels in archives and is erased with the envelope). | none | none |
| SIGNX-002 | 5 | the certificate states each signature's method with its style or fingerprint (`RECORD-002`). | `tests/api.test.mjs:381` | asserted |
| SIGNX-002 | 6 | A member's saved mark keeps its method and image and is offered on their next in-app signing. | none | none |
| SIGNX-003 | 1 | At 1440 and 390, complete signing and preparation on a realistic envelope under BASE-ACCESSIBILITY-001. | none | none |
| SIGNX-003 | 2 | At 200% zoom, field entry, error recovery and completion remain usable in both themes. | none | none |
| SIGNX-004 | 1 | The second signer declines.. | `tests/api.test.mjs:203` | asserted |
| SIGNX-004 | 1 | The third signer is never invited.. | `tests/api.test.mjs:194` | asserted |
| SIGNX-004 | 1 | The sender receives the entered decline reason.. | `tests/api.test.mjs:203` | asserted |
| SIGNX-004 | 1 | The certificate records the decline.. | `tests/api.test.mjs:203` | asserted |
| SIGNX-005 | 1 | The new signer sees the versioned disclosure.. | `tests/api.test.mjs:234` | asserted |
| SIGNX-005 | 1 | Acceptance is recorded against that exact disclosure version.. | `tests/api.test.mjs:241` | asserted |
| SIGNX-005 | 1 | The second signer withdraws consent.. | `tests/api.test.mjs:251` | asserted |
| SIGNX-005 | 1 | The envelope stops and the withdrawal is recorded.. | `tests/api.test.mjs:251` | asserted |
| SIGNX-005 | 1 | The certificate quotes the disclosure version.. | `tests/api.test.mjs:258` | asserted |
| SIGNX-008 | 1 | a signer downloads and prints the document before signing. | `tests/journeys/envelope-detail.mjs:80` | asserted |
| SIGNX-008 | 1 | on an envelope that allows paper signing, a signer uploads a three-page scan, the sender accepts it. | `tests/api.test.mjs:450` | asserted |
| SIGNX-008 | 1 | the certificate marks the signature as wet ink with the scan's fingerprint. | `tests/journeys/envelope-detail.mjs:80` | asserted |
| SIGNX-008 | 1 | when paper signing is not allowed, the option is absent. | `tests/journeys/envelope-detail.mjs:71` | asserted |
| SIGNX-008 | 1 | the API refuses the upload. | none | none |
| SIGNX-009 | 1 | a signer comments on page 2, the sender replies. | none | none |
| SIGNX-009 | 1 | the next signer sees the thread when it was shared with them. | none | none |
| SIGNX-009 | 1 | a supplemental handbook must be acknowledged before the signer can finish. | none | none |
| SIGNX-009 | 1 | the certificate lists the acknowledgment. | none | none |
| SIGNX-009 | 1 | its time. | none | none |
| SIGNX-009 | 2 | Comments and supplemental documents join `SIGNX-003`'s accessibility scan. | none | none |
| SIGNX-009 | 2 | its keyboard-only and screen-reader journeys before they ship. | none | none |
| SIGNX-009 | 3 | Each document declares view or explicit acknowledgment required. | none | none |
| SIGNX-009 | 3 | requesting approval fixes these bytes and requirements. | none | none |
| SIGNX-009 | 4 | A verified recipient who accepted the existing disclosure opens the fingerprint-checked PDF. | none | none |
| SIGNX-009 | 4 | this records that the application served it, not proof the person read or understood it. | none | none |
| SIGNX-009 | 5 | Explicit acknowledgment requires that opening first. | none | none |
| SIGNX-009 | 6 | Electronic and paper signing refuse unmet requirements for that recipient and identity. | none | none |
| SIGNX-009 | 6 | a replacement recipient starts again. | none | none |
| SIGNX-009 | 7 | The certificate lists every reference document fingerprint. | none | none |
| SIGNX-009 | 7 | each recipient’s opening and acknowledgment times, without adding the reference pages to the signed PDF. | none | none |
| SIGNX-009 | 8 | Copies, drafts, templates, archives, verification and erasure retain the document custody. | none | none |
| SIGNX-009 | 8 | new envelopes retain no earlier acknowledgment. | none | none |
| SIGNX-011 | 1 | Page-anchored threads use explicitly selected sender and/or recipient identities. | none | none |
| SIGNX-011 | 1 | the thread author alone changes the audience, and replies inherit it. | none | none |
| SIGNX-011 | 2 | The author is not added implicitly. | none | none |
| SIGNX-011 | 3 | A correction changing the name or email, or a reassignment, starts a new recipient identity epoch even when a mailbox is reused. | none | none |
| SIGNX-011 | 4 | The explicit Record custody export and whole-installation archive carry the complete transcript under the document record-holder’s existing access. | none | none |
| SIGNX-011 | 4 | custody restoration never grants interactive comment access to the destination owner. | none | none |
| IDV-001 | 1 | The envelope preserves four distinct authentication combinations.. | none | none |
| IDV-001 | 1 | Each recipient must pass their own authentication method.. | `tests/api.test.mjs:506` | asserted |
| IDV-001 | 1 | Link-only recipients receive no code.. | `tests/api.test.mjs:503` | asserted |
| IDV-001 | 1 | The certificate lists link-only, email-code and access-code results.. | `tests/api.test.mjs:506` | asserted |
| IDV-002 | 1 | through an SMS provider fake, a recipient receives and enters a code, a wrong code. | none | none |
| IDV-002 | 1 | an expired code are refused. | none | none |
| IDV-002 | 1 | the certificate records the masked number. | none | none |
| IDV-002 | 1 | a `DELIV-006` correction of a recipient's number is audited with its before and after values. | none | none |
| IDV-002 | 1 | the old link refuses. | none | none |
| IDV-002 | 1 | a `DELIV-005` resend by SMS through the provider fake reaches the signer, who opens the SMS link and signs, and after rotation the old link refuses. | none | none |
| IDV-003 | 1 | A wrong access code is refused.. | none | none |
| IDV-003 | 1 | Five wrong attempts lock the invitation.. | `tests/api.test.mjs:531` | asserted |
| IDV-003 | 1 | The correct code admits the unlocked recipient.. | `tests/api.test.mjs:531` | asserted |
| DELIV-001 | 1 | Provider webhooks move the invitation to delivered.. | `tests/delivery.test.mjs:39` | asserted |
| DELIV-001 | 1 | Provider webhooks move it to opened.. | `tests/delivery.test.mjs:89` | asserted |
| DELIV-001 | 1 | An uncertain send is labeled uncertain.. | `tests/delivery.test.mjs:97` | asserted |
| DELIV-001 | 1 | An uncertain send is not duplicated.. | `tests/delivery.test.mjs:102` | asserted |
| DELIV-002 | 1 | The bounced recipient is flagged.. | `tests/delivery.test.mjs:161` | asserted |
| DELIV-002 | 1 | The sender is alerted once.. | `tests/delivery.test.mjs:167` | asserted |
| DELIV-002 | 1 | Correction stores the new address.. | `tests/delivery.test.mjs:179` | asserted |
| DELIV-002 | 1 | The corrected recipient signs and completes the envelope.. | `tests/delivery.test.mjs:186` | asserted |
| DELIV-003 | 1 | Current-signer reminders occur on days 2, 4 and 6.. | `tests/api.test.mjs:316` | asserted |
| DELIV-003 | 1 | No reminder occurs on the crossed weekend.. | `tests/api.test.mjs:312` | asserted |
| DELIV-003 | 1 | The waiting signer receives no reminder.. | `tests/api.test.mjs:318` | asserted |
| DELIV-003 | 1 | Reminders stop after that signer signs.. | `tests/api.test.mjs:322` | asserted |
| DELIV-004 | 1 | The ten-day envelope warns on day 7.. | `tests/api.test.mjs:270` | asserted |
| DELIV-004 | 1 | The extension adds fourteen days to expiry.. | none | none |
| DELIV-004 | 1 | The signer completes on day 12.. | none | none |
| DELIV-005 | 1 | resend by email through the provider fake: the same link again, then a new link, after which the old link refuses. | none | none |
| DELIV-005 | 1 | the signer opens the resent link and signs. | none | none |
| DELIV-005 | 1 | each resent message shows its own status. | none | none |
| DELIV-005 | 1 | the resend is made from the envelope detail page (`MANAGE-005`). | none | none |
| DELIV-006 | 1 | after signer 1 signs, correct signer 2's email and add a copy recipient. | none | none |
| DELIV-006 | 1 | signer 1's signature stands, the old link for signer 2 refuses. | none | none |
| DELIV-006 | 1 | the new one completes the envelope. | none | none |
| DELIV-006 | 1 | an attempt to change signer 1's signed field, through the correction screen or the API, is refused. | none | none |
| DELIV-006 | 1 | the audit trail shows each correction with its before and after values. | none | none |
| DELIV-007 | 1 | Both signers receive a completed copy.. | `tests/api.test.mjs:554` | asserted |
| DELIV-007 | 1 | The copy recipient receives a completed copy.. | `tests/api.test.mjs:554` | asserted |
| DELIV-007 | 1 | The secure link requires its own mailbox code.. | `tests/api.test.mjs:566` | asserted |
| DELIV-008 | 1 | Decline and completion notifications reach Slack.. | none | none |
| DELIV-008 | 1 | Decline and completion notifications reach Microsoft Teams.. | none | none |
| DELIV-008 | 1 | Decline and completion notifications reach a Nook test installation.. | none | none |
| DELIV-008 | 1 | Decline and completion notifications reach email.. | none | none |
| DELIV-008 | 1 | No other notification is sent under those subscriptions.. | none | none |
| DELIV-008 | 1 | Unsubscribed Teams receives no later completion.. | none | none |
| DELIV-008 | 1 | The other three channels receive the later completion.. | none | none |
| DELIV-008 | 1 | Every notice appears in the in-app activity feed.. | none | none |
| FORM-001 | 1 | open a form link signed out, verify an email and sign. | none | none |
| FORM-001 | 1 | the envelope is sent with no human approval step. | none | none |
| FORM-001 | 1 | its record names the web-form policy. | none | none |
| FORM-001 | 1 | the company signer countersigns. | none | none |
| FORM-001 | 1 | a bot request without a Turnstile token. | none | none |
| FORM-001 | 1 | a submission past the limit are refused. | none | none |
| FORM-001 | 2 | a native owner/admin or explicitly permitted sender publishes an immutable form pinned to the current visible template version, one public signer role and fixed other recipients. | none | none |
| FORM-001 | 3 | The API returns its public link, SVG QR and iframe snippet. | none | none |
| FORM-001 | 4 | Turnstile is checked server-side at code request, email verification and submission, with action and installation hostname validation. | none | none |
| FORM-001 | 5 | Codes expire in ten minutes, allow five attempts and are limited to three per normalized email/form in a rolling hour, including failed mail. | none | none |
| FORM-001 | 6 | Submission consumes the hash-only ten-minute email admission token with the envelope creation, current owner/permission/template and policy fences, total/daily counters, one-per-email rolling 24-hour fence and account-wide ten-per-IP rolling-hour fence. | none | none |
| FORM-001 | 7 | Total defaults to 100 (maximum 10,000), daily to 50 (UTC calendar days) and expiry to 90 whole days (maximum 365). | none | none |
| FORM-002 | 1 | Autonomous sends record the form credential, principal and current policy versions. | none | none |
| FORM-002 | 1 | internal approvals recheck that credential and policy at their last release. | none | none |
| FORM-002 | 2 | Policy-off/person submissions are unsigned held drafts. | none | none |
| FORM-002 | 2 | switching policy back on never releases them. | none | none |
| FORM-002 | 3 | Only the qualifying form owner confirms eligibility or voids the held draft, with an owner/admin fallback after publisher loss. | none | none |
| FORM-002 | 3 | that fresh personal release retains form provenance and consumes the account send budget. | none | none |
| FORM-002 | 4 | Owner/role/permission loss permanently suspends the form, never transfers or revives it. | none | none |
| FORM-002 | 5 | Statistics contain counts only. | none | none |
| FORM-002 | 6 | Admission PII is purged after 24 hours, hashed IP rate identifiers after one hour, and raw IP/UA appear only in the envelope’s RECORD-002 evidence. | none | none |
| FORM-002 | 7 | Form configuration, permission and rate/admission state are excluded from document archives. | none | none |
| FORM-002 | 7 | the envelope’s form provenance travels with its record. | none | none |
| FORM-002 | 8 | ADMIN-005 inherits form/permission change history before its account audit is complete. | none | none |
| MANAGE-001 | 1 | The seeded inventory contains 5,000 envelopes.. | `tests/api.test.mjs:741` | asserted |
| MANAGE-001 | 1 | Recipient-email search returns exactly the matching envelope.. | `tests/api.test.mjs:739` | asserted |
| MANAGE-001 | 1 | That search takes less than one second.. | `tests/api.test.mjs:738` | asserted |
| MANAGE-001 | 1 | Every status count matches the seeded inventory.. | `tests/api.test.mjs:741` | asserted |
| MANAGE-003 | 1 | The admin finds the colleague’s envelope in Waiting for me.. | `tests/api.test.mjs:334` | asserted |
| MANAGE-003 | 1 | The second signer completes from their in-app session after signer 1.. | `tests/api.test.mjs:341` | asserted |
| MANAGE-004 | 1 | The report reconciles the expected counts for 300 envelopes.. | `tests/api.test.mjs:769` | asserted |
| MANAGE-004 | 1 | The report reconciles the median turnaround.. | `tests/api.test.mjs:769` | asserted |
| MANAGE-004 | 1 | Each sender’s metrics reconcile.. | `tests/api.test.mjs:770` | asserted |
| MANAGE-004 | 1 | Each template’s metrics reconcile.. | `tests/api.test.mjs:775` | asserted |
| MANAGE-004 | 1 | The CSV matches the complete report.. | `tests/api.test.mjs:782` | asserted |
| MANAGE-005 | 1 | for an envelope with three recipients mid-routing, the detail page at 1440 and 390 pixels shows each recipient's sent, delivered, viewed and signed times matching the provider events (`DELIV-001`). | none | none |
| MANAGE-005 | 1 | the audit trail. | none | none |
| MANAGE-005 | 1 | its remind action sends one reminder to the current signer only. | none | none |
| RECORD-002 | 1 | The email-code and in-app signers complete the envelope.. | `tests/api.test.mjs:125` | asserted |
| RECORD-002 | 1 | Certificate authentication methods match the audit.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate IP addresses match the audit.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate user agents match the audit.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate adoption methods match the record.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate disclosure evidence matches the record.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate UTC times match the audit.. | `tests/api.test.mjs:381` | asserted |
| RECORD-002 | 1 | Certificate US time-zone times match the audit.. | `tests/api.test.mjs:381` | asserted |
| RECORD-004 | 1 | A genuine executed PDF matches the record.. | `tests/api.test.mjs:145` | asserted |
| RECORD-004 | 1 | A changed file reports no match.. | `tests/api.test.mjs:149` | asserted |
| RECORD-004 | 1 | An unrelated file reports no match.. | none | none |
| RECORD-004 | 1 | Nonmatching files expose only match and fingerprint fields.. | `tests/api.test.mjs:148` | asserted |
| RECORD-005 | 1 | A seven-year rule purges only after the warning.. | `tests/api.test.mjs:1151` | asserted |
| RECORD-005 | 1 | The warning names the rule and purge date.. | `tests/api.test.mjs:1151` | asserted |
| RECORD-005 | 1 | The held envelope survives the scheduled rule.. | `tests/api.test.mjs:1164` | asserted |
| RECORD-005 | 1 | The held envelope survives the erase request.. | `tests/api.test.mjs:1164` | asserted |
| ADMIN-001 | 1 | a sender sends, corrects and voids their own envelope. | `tests/api.test.mjs:646` | asserted |
| ADMIN-001 | 1 | two senders cannot see each other's envelopes until one shares the envelope (or, once `MANAGE-002` ships folders, a folder). | `tests/api.test.mjs:626` | asserted |
| ADMIN-001 | 1 | a view-only share lets the other read but not void. | none | none |
| ADMIN-001 | 1 | a viewer can read but not send. | `tests/api.test.mjs:635` | asserted |
| ADMIN-001 | 1 | the API enforces the same boundaries. | none | none |
| API-003 | 1 | a test page on an allowed origin embeds signing and receives the signed event. | none | none |
| API-003 | 1 | an unlisted origin is refused. | none | none |
| API-003 | 1 | embedded preparing creates and explicitly sends an envelope. | none | none |
| API-003 | 2 | The acceptance journey additionally proves every boundary and rider above, including declined and closed events, at 1440 and 390 for each changed screen. | none | none |
| API-003 | 3 | API-001 retains any future scoped external launch-credential door before it ships. | none | none |
| API-003 | 4 | The complete API, SDK, webhook, template, bulk, branding and integration targets remain unchanged. | none | none |
| INTEG-001 | 1 | through a HubSpot fake, send from a deal, complete it. | none | none |
| INTEG-001 | 1 | show the deal's properties, timeline event and attached PDF updated once. | `tests/hubspot-envelope.test.mjs:163` | asserted |
| INTEG-001 | 1 | a contact created in the fake appears in the contact book after sync. | none | none |
| INTEG-004 | 1 | through a Google fake, send a Drive document. | none | none |
| INTEG-004 | 1 | show the completed PDF and certificate in the configured folder. | `tests/google.test.mjs:31` | asserted |
| INTEG-004 | 1 | pick a Google Doc. | `tests/google.test.mjs:51` | asserted |
| INTEG-004 | 1 | show it arrives as a converted PDF whose fingerprint the envelope binds. | `tests/google.test.mjs:51` | asserted |
| INTEG-004 | 1 | in the Gmail add-on test harness, open a message with a PDF attachment from a client with one person on Cc, see the attachment. | none | none |
| INTEG-004 | 1 | both participants proposed as recipients, and send. | none | none |
| INTEG-004 | 1 | from another message, sign the attached PDF yourself with no mail sent to you. | none | none |
| INTEG-004 | 2 | The contextual Apps Script add-on opens the native preparation door with a message reference. | none | none |
| INTEG-004 | 2 | a send or self-sign choice. | none | none |
| INTEG-004 | 2 | native review, field placement, eligibility confirmation and recipient authentication remain required. | none | none |
| INTEG-004 | 3 | Per-template Drive filing uses explicit administrative consent, verified completed bytes and manual recovery from uncertain uploads. | none | none |
| INTEG-004 | 4 | Configured Gmail reply intake verifies Google OIDC caller identity, the exact audience, subscription and mailbox, a fresh push and replay receipts, fetches Gmail history and messages at the network edge, and reuses AGENT-003’s current invitation capability, exact sender, grant, contact, private reply, logging, archive, hold and erasure gates. | none | none |
| INTEG-012 | 1 | Only recipient-address metadata is fetched before a current reply capability is resolved. | none | none |
| INTEG-012 | 1 | message bodies, other headers and attachments are fetched afterward. | none | none |
| INTEG-012 | 2 | Credentials, push receipts. | none | none |
| INTEG-012 | 2 | the mailbox-bound history cursor are installation state excluded from business archives. | none | none |
| INTEG-012 | 2 | restore creates no active reply capability. | none | none |
| INTEG-012 | 3 | Provider tokens and Google add-on deployment are installation provisioning, separately from the acceptance fake. | none | none |
| INTEG-006 | 1 | through Box and Dropbox fakes, a completion files the PDF and certificate once each. | none | none |
| INTEG-006 | 1 | a retry does not duplicate. | none | none |
| INTEG-015 | 1 | One scoped import spans several provider pages, interrupts and resumes, reconciles every selected contact without duplicates and does not ask for consent again for each page. | none | none |
| INTEG-015 | 2 | An authorized recurring sync retains source record identity. | none | none |
| INTEG-015 | 2 | conflicting local edits are reported, and absence from a provider page never silently deletes a local contact. | none | none |
| INTEG-015 | 3 | Every continuation checks the current authorization, authorizing member and connector credential before reads and commits. Revocation or authority loss prevents the next page’s reads and writes. | none | none |
| INTEG-015 | 3 | restoring authority does not revive the authorization. | none | none |
| INTEG-015 | 4 | Unconsented or unauthorized preparation and sync are refused. An ineligible CRM owner gains neither envelope access nor a follow-up grant. | none | none |
| INTEG-015 | 5 | The audit retains the exact authorization scope, version, actor, time and outcome without credentials or imported field values in operational logs. Restored prepared provenance does not restore connector authority. | none | none |
| INTEG-015 | 6 | The connector’s configuration, launch and progress screens expose page and record counts, failures and remaining work at both required widths. | none | none |
| MOBILE-001 | 1 | The phone journey sends from a template.. | none | none |
| MOBILE-001 | 1 | The phone journey sends one reminder to the signer.. | `tests/journeys/mobile-sending.mjs:40` | asserted |
| MOBILE-001 | 1 | The phone journey voids the intended envelope.. | `tests/journeys/mobile-sending.mjs:52` | asserted |
| PORT-002 | 1 | The exported data is at least 2 GB.. | `tests/journeys/archive-capacity.mjs:40` | asserted |
| PORT-002 | 1 | The selective download resumes after an interruption.. | `tests/journeys/archive-capacity.mjs:38` | asserted |
| PORT-002 | 1 | The installation archive builds and restores into an empty destination.. | `tests/journeys/archive-capacity.mjs:58` | asserted |
| PORT-002 | 1 | Every restored fingerprint is present and verified.. | none | none |
| COMPLY-002 | 1 | Operational logs contain no field values after a full signing journey.. | `tests/compliance.test.mjs:94` | asserted |
| COMPLY-002 | 1 | Operational logs contain no document text after that signing journey.. | `tests/compliance.test.mjs:94` | asserted |
| COMPLY-002 | 1 | Every member, including invited and inactive members, is listed.. | `tests/compliance.test.mjs:57` | asserted |
| COMPLY-002 | 1 | Every active member has the expected last-access evidence.. | none | none |
| AGENT-003 | 1 | three stalled signers (bounce, out-of-office until Monday, reply objecting to a clause). | none | none |
| AGENT-003 | 1 | under the company’s external-class contact policy the agent proposes a corrected address, waits until Monday, and routes the objection to the sender, staying within the contact limit. | none | none |
| AGENT-006 | 1 | Rename a CRM field in the fake. | none | none |
| AGENT-006 | 1 | the specialist detects the failed write-backs and proposes a new mapping. Under the held company policy, the authorized person approves the repair and replay creates no duplicate. | none | none |
| AGENT-007 | 1 | After ten envelopes receive the same added field, a suggestion cites all ten examples. Under the held company policy, the template owner reviews the diff and publishes version 2. | none | none |
| PREP-007 | boundary | The DOCX acceptance pointer belongs to PREP-001’s requirement. | Requirement or field proof register | moved |
| SIGNX-003 | boundary | Human screen-reader and VPAT proof belongs to R-1 and R-2. | Requirement or field proof register | moved |
| PORT-001 | boundary | Base’s full archive equivalence duty is cited as BASE-DATA-001; journal-specific completeness remains an outcome. | Requirement or field proof register | moved |
