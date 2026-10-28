Agreement record rules

These detailed definitions govern preparation, routing, signing and custody. The contract links each capability to its corresponding definition. An implementation note records a boundary without reducing the target.

## HTTP-001

Health, API and document routing

`/health` includes deployment identity; Hono owns `/api/*`, and Start serves application documents.
Unknown routes return 404.

## ACCESS-001

Server-side roles and scoped authority

Private API handlers authorize the session, API key or agent token and its role, permission profile or scopes on every request, against the role matrix of `ADMIN-001` and any custom permission profile (`ADMIN-008`): senders prepare, send, correct and void their own envelopes and those shared with them for editing; admins act on every envelope; viewers read; only the owner manages agent tokens, archives and erasure.
A preparation token may only prepare (`DELEGATE-001`).
Changes require the application's own origin.
Every write rechecks the actor's current role, session and the record's version in the same atomic D1 batch.
A Base member is Inkwell's sender or viewer, a viewer until an owner or admin chooses sender, so members kept their read-only authority when these roles shipped; a sender sees and acts on the envelopes they created and those shared with them to edit, reads those shared with them to view, and every other envelope is refused with 403 and absent from their list and search (`ADMIN-001`); every role may sign their own turn (`MANAGE-003`).
Member roles are installation state and do not travel in an archive, so a restored member is a viewer.
Every write by a sender rechecks, in the same atomic batch, that they created the envelope or still hold an edit share of it.
Folder and group shares (`ADMIN-001`), permission profiles (`ADMIN-008`), API keys (`API-001`) apply this matrix before they ship, and correction (`DELIV-006`) applies it: whoever may change the envelope corrects it, and a viewer is refused.

## SEND-001

Prepare a fixed envelope and authorize sending

A sender prepares an envelope whose documents are bound by their SHA-256 fingerprints, with recipients, routing order and fields (`PREP-*`, `ROUTE-001`).
Every send has a named authority, recorded on the envelope.
An ad hoc send by a person requires that person's explicit confirmation that the document is eligible for electronic signature.
A send from a template, a bulk batch (`BULK-001`), a web form (`FORM-001`), an API key or OAuth client with the send scope (`API-001`, `MOVE-007`), an integration (`INTEG-001`, `INTEG-002`, `INTEG-011`) or a schedule (`PREP-009`) goes out under the account's sending policy (`ADMIN-004`), which the owner or an admin set once: there is no per-envelope human approval, and the record names the policy, its version and the credential that used it.
An internal approval rule (`ROUTE-004`) adds a person's approval wherever the policy demands one.
After sending, the documents' bytes never change, and recipients, fields and settings change only through audited corrections (`DELIV-006`, `ROUTE-006`, `ROUTE-011`), which never alter a field already signed or a signature already given.
Today's build is the narrow first-release case: one PDF, one to five ordered signers, ad hoc sends by a person only, and audited corrections by `DELIV-006`; that case is a subset of `ROUTE-001` (up to 100 recipients) and the policies above, never a limit on them.
At scheduled dispatch and the last ROUTE-004 approval, Inkwell rechecks the confirming person's active account, current owner/admin authority or sender role plus ownership/edit share, and the unchanged sending definition.
The definition fingerprint covers the PDF fingerprint, recipients, fields, free-form flag, copies, supplemental documents, messages, expiry, reminders, paper/reassignment options and template approval rule.
The current envelope version, that authority and the `PREP-011` free-form setting version are fenced in the same atomic batch as invitations.
A missing or stale confirmation, including a legacy deferred confirmation without this fingerprint, returns the envelope to a held draft, revokes its unused signing links and requires a current editor's fresh eligibility confirmation; restoring the previous person's role or share alone never releases it.
An expired browser session alone does not cancel the person's recorded confirmation.
Live recheck at every release (scope-review-65 A7): an immediate send, a scheduled send, the last `ROUTE-004` approval, each bulk row and each web-form release re-check, in the same atomic batch as the invitations, the current policy versions (`ADMIN-004`); that the credential is active, unexpired and not suspended; the principal's current status and role or profile; that the template live revision matches its confirmation snapshot; and the sending-definition fingerprint above.
A failed re-check follows `ADMIN-004`'s hold rule.
Ct's 21 October template recheck ruling: preparation freezes the bytes and sending definition at the pinned template version.
Each eligibility confirmation records that template ID, pinned version and then-live revision, including its approval rule and sending-policy version.
Every immediate release, scheduled dispatch and last ROUTE-004 approval fences that live revision in the invitation batch.
Any intervening edit, new version, rule or sending-policy change, disablement or deletion holds the draft and revokes unused signing links; restoring an earlier state never releases it.
A current editor's fresh confirmation may release the unchanged older frozen definition and bytes, recording the new confirmer and time and re-snapshotting the live revision; it never adopts newer template content.
Preparing a newer definition requires a new draft version and confirmation.
Deletion keeps the frozen approval rule and never changes a sent envelope.

## SIGN-001

Authenticated, consented signing in routing order

Each recipient opens their own single-use link and passes the authentication method the sender chose for them (`IDV-001`): none (the link alone), email code, access code, SMS code, knowledge-based or phone authentication, or identity verification.
A signed-in member signing in the app is authenticated by their session (`ROUTE-009`, `MANAGE-003`).
The email-code method sends a six-digit code with one-minute resend spacing, ten-minute expiry and five attempts.
The recipient reviews the exact approved bytes of the documents visible to them (`ROUTE-012`), completes exactly their fields and consents explicitly (`SIGNX-005`) before signing.
Only recipients whose routing order is current can sign: recipients sharing an order act in parallel, and the next order is invited when everyone at the current order has finished (`ROUTE-002`).
Today's build offers link only and email code per recipient, each with or without an access code (`IDV-001`); when mail is suppressed every remote recipient verifies a sender-provided verification code alongside the owner's once-visible signing link, and link only is refused.

## SEND-002

Void an unfinished envelope

The envelope's sender, anyone it is shared with for editing, or an admin (`ADMIN-001`) voids a sent or partially signed envelope with a reason; outstanding links, codes and signer sessions stop working immediately and pending mail is canceled.
Owners, admins, the sender who created the envelope and anyone it is shared with to edit (`ADMIN-001`) void it.

## DELEGATE-001

Preparation agents never send

The owner issues and revokes scoped agent tokens.
An agent prepares an envelope through the API; an envelope a preparation token prepares is sent only by a signed-in person's approval, and both preparation and approval are in the audit trail with their actors.
A revoked token loses all authority.
Credentials that send without a person are a separate grant, never a preparation token: API keys and OAuth clients with the send scope, used under the account's sending policy (`API-001`, `ADMIN-004`, `SEND-001`).

## RECORD-001

Executed PDF, certificate and verifiable audit trail

On the last signature Inkwell produces the executed PDF with the signed values, a completion certificate and a hash-chained audit trail; the sender downloads the original, executed PDF, certificate, audit JSON and a handoff manifest, and verification recomputes every fingerprint and the event chain.
Signers download the executed PDF and certificate after completion.

## MOVE-001

DocuSeal archive move-in

The owner previews a DocuSeal completed-submission archive without writes, approves its fingerprint, imports signed PDFs and provider evidence with their provider provenance, reads the durable import journal, downloads imported artifacts and undoes the import.

## PORT-001

Whole-installation export and restore

The owner exports a checksum-bound archive of all envelopes, artifacts and import journals and restores it only into an empty installation.

## ERASE-001

Erasure with a restore fence

The owner erases a voided, expired or completed native envelope after typing ERASE; its files, recipients, mail and command results are removed, and the later erasure journal stops an older backup from restoring it.

## PREP-001

PDF and Word uploads at business size

A sender uploads PDF, DOCX, DOC, RTF, TXT, PNG and JPEG sources up to 25 MB each; non-PDF files are converted to PDF by an isolated conversion service before preparation, and the converted PDF is what every signer sees and what the envelope's fingerprint binds.
Encrypted, corrupt or unsupported files are refused with a reason.
Files are stored in object storage, not in database rows.
Each converted upload is matched against templates (`TMPL-005`), and a converted Word file's text tags become fields as `PREP-007` reads them from the converted PDF, before this ships.

## PREP-002

Multi-document envelopes

One envelope holds up to 20 documents and 100 MiB in total, in an order the sender sets; fields reference a document and page, signers sign all of them in one session, and the executed record keeps each document separately and as one combined PDF.
A document can be marked optional to sign or view-only.
The envelope detail page (`MANAGE-005`) lists every document in order.
Each added document is matched against templates (`TMPL-005`), and an applied match places its fields on that document, before this ships.
Exact semantics: the total is 100 MiB (104,857,600 bytes).
Each component PDF has 1–100 pages; the combined page space has up to 2,000.
Raw PDFs upload in private 64 KiB parts and become product custody only in the guarded preparation transaction.
Fields keep their document index and local page (`documentPage`) beside their combined zero-based `page`; API fields with `document` and `page` name a local page unless `documentPage` already accompanies the combined page.
Required-to-sign documents need every signer’s signature; optional-document fields are optional, and view-only documents refuse fields.
Each original and executed document remains separately downloadable, alongside the combined PDF and one certificate.
Accepted paper scans remain attached to each component’s executed record, as well as the combined record.
Copies and template save/use/edit preserve original component bytes and reset signatures; archive restore, legal hold, retention and erasure cover every component.
TMPL-004 and ROUTE-010/012 inherit these document references and custody before their own roles, combinations or visibility rules ship.

## PREP-003

The complete field set with validation

Fields include signature, initials, date signed (filled automatically in the signer's US time zone), full name, email, company, title, text, number, checkbox, checkbox group with minimum and maximum, radio group, dropdown, attachment upload, stamp, and a note; each can be required or optional, read-only or editable, and validated by pattern (US phone, ZIP, SSN or EIN masked on display, email, currency in USD, date format).
Each business-data field type added here inherits PREP-008’s prefill, reported source and read-only obligations before it ships.
Initials fields carry `SIGNX-002`'s obligation: before they ship, the signer adopts initials by typing, drawing or uploading them, the adopted initials go on every initials field, and the record and certificate keep the method.
Every new field type joins `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before it ships.
Date signed is generated from the server signing instant in the signer-selected US zone (Eastern, Central, Mountain, Arizona, Pacific, Alaska or Hawaii); sender prefill and caller-supplied dates cannot replace it.
Business-data fields accept PREP-008 prefill and reported sources with server-enforced read-only values; signatures, initials and generated dates are not business-data prefills.
Validation checks syntax, not identity or tax registration: ZIP is five digits with an optional four-digit suffix, US phone is ten digits with an optional country code 1 and conventional separators, SSN is nine digits or XXX-XX-XXXX, EIN is nine digits or XX-XXXXXXX, email needs a local part and dotted domain, and dates are real YYYY-MM-DD calendar dates.
SSN and EIN displays are always masked; other business fields may be masked by the sender.
Masking changes field display on preparation/signing overlays and dashboard values, not the executed PDF or the existing authorized audit downloads.
Initials are adopted separately from a signature and the same initials and mark apply to every filled initials field; a signed-in member's saved initials are offered on subsequent in-app signing, outside archives like their saved signature.
Radio and dropdown values are one of the sender's exact option labels.
A checkbox group's value is a JSON array of distinct declared labels, stored in declaration order and printed as a comma-separated list; minimum and maximum selection counts are inclusive whole numbers from zero to the option count.
An answered group meets both bounds; a required group also needs at least one selection, while an optional group may be left blank.
Choices declare 2–20 distinct single-line labels, each at most 100 characters and together at most 500 characters as JSON.
Notes use the existing single-line text value and optional validation/masking.
Each of these four types accepts sender/API prefill with a reported source and a server-enforced read-only setting, survives templates, copies and archive restore, and joins PREP-003's desktop/phone keyboard, accessibility-tree and light/dark scan journey.
Image stamps also accept PNG or JPEG uploads of at most 512 KiB, using SIGNX-002’s actual image parser and size bound.
Stamps accept sender/API prefill with a reported source and a read-only flag; the API value is a data URL containing the image bytes, kept with the field values through copies, templates and archives, protected and erased with the envelope.
The executed PDF scales the image to fit its field without changing its proportions.
Signing and preparation show an image preview unless masked; the dashboard shows an uploaded-image label, never its encoded bytes.
A stamp is a supplied image, not a verified seal.
The signing audit records each filled stamp's SHA-256, verified PNG/JPEG type, byte count and supplier: signer upload, or sender/API prefill with its reported source and read-only flag.
An image equal to its prepared prefill retains that reported supplier, even when the signer submits the same bytes again.
The certificate states `Stamp (<label>): <PNG|JPEG> SHA-256 <hex>, <supplier>; a supplied image, not a verified seal` (including source and read-only for prefills).
Archive staging recomputes the image evidence and checks it against the signing audit; legacy signed stamps without separate evidence retain their original records and are checked against the signing event's existing values fingerprint.
Attachments are unshipped: no attachment field or upload door is available.
The attachment target is one parsed PDF, PNG or JPEG per field, at most 20 fields and 100,000,000 bytes per envelope, with 25,000,000 bytes per file in PREP-001 object storage.
Shipping that target requires 20 MB JPEG/PDF success, 30 MB refusal, SHA-256 on read and restore, and legal hold, purge, erasure and restore-fence proof.
Any future D1 slice must be labelled "attachment slice ≤2 MiB in D1 rows; 25 MB target awaits PREP-001 object storage; attachment acceptance not met" and name its real limit in refusals.
The ct 20 October ruling also binds refusals (empty 400; too big 413; wrong type/leading bytes, corrupt/truncated files, encrypted PDFs or images over 100 MP 415), bounded-memory parsing without full decode, exact submitted bytes, uploader-only unsigned entries cleared on identity replacement or terminal action, immutability after signing, signed-byte audit/manifest/archive validation and retention fences.
Attachments are never mailed or displayed except an uploader's PNG/JPEG preview before signing; downloads use the verified type and `<label>-<sha8>.<ext>` filename with "Uploaded by the signer · not scanned or opened by Inkwell".
Files belong only to the uploader's place and ACCESS-001 record holders; other recipients receive fingerprint lines with type, byte count, SHA-256 and "not verified", with no filename.
Wider recipient sharing waits for ROUTE-012.
No malware scan, quarantine or provider is claimed.
Attachments must join SIGNX-001, SIGNX-003 and PREP-005 before shipping; their full acceptance remains unasserted.

## PREP-004

Conditional and calculated fields

A field can be shown, required or hidden based on another field's value (for example, "Other" reveals a text field), and a number field can be calculated from others (totals in USD).
Hidden fields are never required and never printed.
The inspector sets a field's visibility condition, independent required setting or required-only-when condition, and a number field's sum, first-minus-the-rest or product over named number fields.
Conditions compare trimmed text, a checkbox's true/false or an exact USD number; references stay within one recipient, cannot refer to signatures and cannot form cycles.
Fields are required when shown unless marked optional (checkboxes default optional); a required checkbox must be checked.
A required-only-when rule overrides that setting while the field stays visible.
At least one visible signature must be completed.
USD inputs allow up to two decimal places and safe integer cents; outputs keep two decimals, print with a dollar sign, and products round once to the nearest cent, halfway away from zero.
Hidden numeric inputs contribute zero to formulas; a missing shown input leaves the result incomplete.
Calculated fields are read-only and recomputed by the server; hidden submitted values are discarded.
The same rules survive draft editing, templates and copying.

## PREP-005

Direct field placement and editing

The sender places fields by click or drag on page thumbnails and the full page, resizes, duplicates, aligns and moves them between signers, assigns them by color, and sets each field's properties; keyboard users place and move fields with arrow keys.
The exact semantics: positions and sizes are fractions of the page from its top left corner, kept to 0.0001, and every edit keeps the field whole on its page; a click on a page or its thumbnail places the field there, Enter on a focused page or thumbnail places it at the page's center, and the field chip can be dragged onto either; on a field’s focused selection checkbox the arrow keys move it by 1% of the page, Shift with the arrow keys resizes it by 1% (Right and Down grow, Left and Up shrink; never under 3% wide or 2% high), Enter or Space toggles it in the selection and Delete removes it; a field dragged onto another page or that page's thumbnail moves there; Duplicate copies the selection just below itself and Duplicate to every page copies it to the same place on every other page; align lines two or more selected fields up on the left, center, right, top, middle or bottom of the box around them all; each recipient's fields take that recipient's color (six colors, repeating from the seventh recipient); the inspector sets a selected field's recipient, label, type, page, place and size, and on a phone a field is drawn at least 24 pixels square while its saved box stays exact.
The PDF overlays are pointer editing targets; the equivalent non-overlapping field list is the keyboard and screen-reader editing surface, including arrow-key movement and Shift+arrow resizing.
Each property a later clause adds to a field (`PREP-003`'s initials, checkbox, radio, dropdown, attachment, number and pattern types, required and read-only flags, `PREP-004`'s conditions and formulas, `PREP-011`'s signer-placed fields) is set in this inspector, with a keyboard way, before it ships.
Drag, resize, duplicate, align and reassign join `SIGNX-003`'s accessibility scan and keyboard-only journey (with a keyboard way to do each) before they ship.

## PREP-006

AI field and recipient detection

On upload, Inkwell proposes fields (signature lines, dates, name and title blocks, checkboxes, initials on every page) and recipients (parties named in the document, matched to contacts and CRM records), each with its location and confidence, using the buyer's configured AI provider.
The sender accepts, edits or rejects each proposal; nothing is sent from a proposal alone.
Detection is off by default.
An owner or admin enables it with provider, model, region and retention terms recorded and labelled provider-controlled and unverified.
An editor explicitly runs it per unsent document after disclosure of what will be sent; agents may request detection but a person accepts proposals.
Only that document's locally extracted text, positions and line geometry go to the provider; contacts and CRM matching stay local.
The healthcare profile blocks detection unless separately re-enabled.
Every call rechecks the switch, role and document.
Output is fixed-schema validated and shown as literal text; it cannot set values or recipients or send.
Proposals are unpersisted, nothing is cached, and accepted fields record provider, model and document fingerprint.
Diagnostic logs exclude document text under COMPLY-002; restore brings the switch back off.
Placement accuracy requires a real provider run with the owner's provider account and spending approval.

## PREP-007

Text tags and existing PDF form fields

Text tags in the document (for example `{{signature:1}}` or Docusign-style anchor strings) and existing AcroForm fields become Inkwell fields automatically, with their names kept for API prefill.
The exact semantics: a PDF prepared with no fields given (`envelope.prepare` and `envelope.update` in the app, or the agent preparation API) carries the fields it shows itself, and the prepare screen places the same fields when a PDF is uploaded, for the sender to keep, move, change or remove like any other (`PREP-005`). (1) A text tag is `{{type:recipient}}` or `{{type:recipient:label}}` on one line, where type is signature, initials, date_signed, full_name, email, company, title, text, date, checkbox or number and recipient is the routing place from 1 to 100; the field covers the tag's text as the page displays it, its label is the tag's label (else the type's name), and the executed PDF covers every tag the document shows before drawing the signed values. (2) A Docusign-style anchor string is named by the API caller (`anchors`, at most 20, each with the exact text to find, case-sensitive, of 1–100 characters, a type from the same list, a recipient, an optional label, and an offset right and down from the string's top-left corner and a size, in points): every place the document shows the string gets that field, and an anchor the document never shows refuses the preparation. (3) Each AcroForm text, checkbox, signature, dropdown, list or radio field becomes one field for recipient 1 at its first widget (a radio group spans its widgets on that page), labeled by its alternate name, else its partial name, and required when the form marks it required; a choice list that does not fit Inkwell's options (2–20 distinct options of at most 100 characters, 500 together) arrives as a text field, and push buttons are skipped; the executed PDF keeps none of the document's own form (its widgets, AcroForm with any XFA, and usage rights) under the signed values.
Text is read from the page content streams and the form XObjects they draw, through each font's ToUnicode map, else its simple encoding, and its widths (or the standard 14 fonts' metrics); text the document does not show as characters (an image of a tag, a scan) carries no tags.
Each field the document carried keeps its document name (the tag's label or the tag itself, the anchor string, or the form field's full name) and its origin (text tag, anchor or form field) in the record, through drafts, templates and copies.
An API prefill map (`prefill` on `envelope.prepare` and `template.use`) is keyed by field ID or by a document name, which fills every field carrying it, under `PREP-008`'s rules; an unknown key refuses the preparation.
A tag or anchor for a recipient the envelope lacks is refused, and giving both fields and anchors is refused.
Word sources arrive with `PREP-001`'s conversion, which carries this clause before Word uploads ship: a DOCX's text tags are read from its converted PDF.

## PREP-008

Prefill from business data

Fields can be filled by the sender before sending or from an API payload, editable by the signer or locked as read-only; each prefilled value records its reported source.
Today this covers text, date, checkbox and USD number fields.
Signatures and calculated fields cannot be prefilled.
The inspector sets the value, source and lock in drafts and templates; template.use accepts a prefill map keyed by field ID, with value, source and optional readOnly.
Values are one trimmed line of at most 500 characters, source labels one line of at most 200; dates use valid YYYY-MM-DD, checkboxes true/false, and USD values follow PREP-004’s exact safe-cent semantics.
Missing signer inputs use the prepared defaults; an editable value can be replaced or cleared, while an attempt to change a visible locked value is refused by signing and save-progress, even through direct transport.
Hidden fields stay discarded under PREP-004.
The prepared field definition and audit trail bind the supplied value and source; the signed record separately records the signer’s final values.
Provenance is labeled “supplied by the caller, not verified with the CRM”, never as provider verification.
Prefill and sources follow the existing verified-document and disclosure gates and are absent from an unverified recipient view.
Defaults, sources and locks survive draft edits, templates, copies and whole-installation restore, without copying signed entries.
Native CRM record merging belongs to INTEG-001, INTEG-002 and INTEG-003: each merges the selected record into these fields and records its source before it ships.

## PREP-009

Messages, drafts and scheduled sending

The sender sets the email subject and message for the envelope and a private message per recipient, saves a draft and returns to it, and schedules sending for a future date and time in a US time zone.
A draft is a prepared envelope before approval; reopened, everything in it can be changed and saved again (its PDF, title, recipients and routing order, access codes, fields, expiry, reminders, copy recipients, the paper option, the subject, the message and each private message), keeping its ID, sender and audit trail, and the record names every saved version.
An access code is kept only for the same recipient in the same place in the list; elsewhere it is entered again.
The subject (one line, up to 200 characters) replaces "Please sign: <title>"; the message (up to 2,000 characters) goes to every recipient, and a private message (up to 1,000) only into that recipient's invitation and their verified signing page.
A copy (`PREP-010`) keeps the messages.
A schedule is set at approval as a wall-clock time in one of the US zones America/New_York, America/Chicago, America/Denver, America/Phoenix, America/Los_Angeles, America/Anchorage or Pacific/Honolulu, in the future and before expiry; a time that does not exist in that zone is refused, and scheduling needs mail set up.
The person's eligibility approval with that time is the send's authority, recorded as approved for later; the first invitations go on the first hourly pass at or after it, nobody can sign before then, and reminders and expiry warnings count from the send.
Scheduled sends under the account's sending policy join with `ADMIN-004` (`SEND-001`).

## PREP-010

Copy an envelope

From any sent, completed, declined, voided or expired envelope the sender can see, Copy creates a new draft with the same documents (the original, unsigned bytes), recipients, fields, messages and settings, without any entered values or signatures; the new envelope records the envelope it was copied from.

## PREP-011

Free-form signing

When the account's free-form setting (`ADMIN-004`) is on, a sender sends documents with no placed fields; each signer then places their own signature, initials, date signed, full name and single-line text fields wherever they choose, must place at least one signature before finishing, and the record and certificate mark the envelope as free-form and list the fields each signer placed.
The setting is account-wide, off by default, and only an active owner or admin changes it, fenced with their role in the same write; each change is recorded append-only with actor, time, before and after value and the new setting version, and appears in `ADMIN-005`'s log when that ships.
When `ADMIN-004`'s group and profile policies ship, this setting is their account-wide default.
At every release of a send (ad hoc confirmation, `PREP-009` dispatch, the last `ROUTE-004` approval, `API-001` and `MOVE-007` sends) the setting's current value and version are fenced in the same atomic batch as the invitations, the free-form flag is part of `SEND-001`'s sending fingerprint, and the envelope records the setting version that allowed it; with the setting off an interactive send is refused in the UI and the API and a deferred one becomes `SEND-001`'s held draft, which turning the setting back on never releases.
Turning the setting off never changes an envelope already sent: it completes under its recorded version or is voided as usual.
A free-form envelope has no sender-placed fields.
Each signer action is fenced by the envelope version, the signer's turn, a verified session, access code and disclosure as for any signing; the server takes the placing signer from the session and refuses fields for another place, at most 100 fields per signer, any field not whole on its page (`PREP-005` geometry) or overlapping a field an earlier signer signed.
Date signed is generated as in `PREP-003`.
Placed but unsigned fields are `SIGNX-001` saved entries, cleared on signing, decline, void, paper signing or reassignment (`ROUTE-006`); after signing they never change, and `DELIV-006` corrections never add sender fields to a free-form envelope.
The certificate (`RECORD-002`) states the setting version, its setter and, for each signer, every placed field's type, label, page, position and size to 0.0001 of the page, value (masked per `PREP-003`), adoption method (`SIGNX-002`) and time in UTC and the account's US time zone; the signing event's values fingerprint covers the placed fields and archive restore rechecks it.
Before shipping, signer-placed fields join `SIGNX-001`'s Next and count, `PREP-005`'s inspector with a keyboard way to place, move, resize and remove, and `SIGNX-003`'s scan, keyboard-only and screen-reader journeys.
Current sending capabilities apply these fences; every future send door, including `API-001` and `MOVE-007`, inherits them before it ships.

## PREP-012

Document generation from Word templates

A template's DOCX can carry merge fields, repeating table rows (for example line items with quantities and USD amounts) and conditional sections.
At send time Inkwell fills them from sender input, a CRM record (`PREP-008`) or the API payload, converts the result to PDF (`PREP-001`) and fingerprints the generated document; the sender previews it before sending, and a missing required merge value stops the send with its name.
Clause libraries and negotiated drafting stay in Locket.

## TMPL-001

Reusable templates with saved roles

A template holds documents, fields, roles (for example Client and Company Signer) with routing order, messages, reminders, expiry and identity settings; sending from it asks only for each role's name and email (or a signing group, `ROUTE-005`) and any sender fields.
Several templates can be combined in one envelope (`TMPL-004`).
A template holds up to 20 ordered PDFs with their required, optional or view-only modes under PREP-002’s total byte limit and one to 100 roles, each with a name unique in the template, a routing order (roles that share one sign at the same time, `ROUTE-002`), an optional private message and whether it needs an access code (`IDV-003`); the fields placed for each role, with at least one signature field per role; the invitation subject and message; reminders (`DELIV-003`); expiry as whole days from preparation, 1 to 365 and 120 unless set (`DELIV-004`); and the paper (`SIGNX-008`) and reassignment (`ROUTE-006`) options.
Its identity settings are the email code every recipient verifies today and the access-code requirement: an access code is a secret the sender gives that person, so it is never stored in the template and the send form asks for it beside that role's name and email; Each role keeps `IDV-001`'s method (email code or link only).
The send form collects PREP-008 business values, reported sources and signer read-only choices without placement.
Explicitly clearing a value removes that new draft’s saved default and read-only flag; it never changes the template.
Generated and calculated fields cannot be supplied or cleared.
Sending prepares a draft from the template's stored bytes, validated exactly as a hand-prepared envelope, and the envelope and its prepared event record the template's ID and name; a person then approves it with the eligibility confirmation, as for an ad hoc send, until `ADMIN-004`'s template sending policy ships (`SEND-001`).
Owners, admins and senders make templates from the prepare screen; a sender sees, uses and deletes the templates they made, owners and admins all of them, and viewers none (`ACCESS-001`'s envelope rule); `TMPL-002`'s folders and shares let a sender use or edit others' templates.
Editing a template makes its next version (`TMPL-003`); deleting a template leaves envelopes sent from it unchanged.
Templates are business records and travel in the archive.
Follow-up template defaults inherit AGENT-003’s contact settings and still require an explicit person’s per-envelope grant before shipping.

## TMPL-002

Shared team templates

Templates live in personal or shared folders with an owner, can be shared with people or groups to use or to edit, and are searchable by name and tag.
Exact semantics: every template is in exactly one folder: its maker's personal folder ("My templates", only theirs) or a shared folder, which owners, admins and senders create and own.
A template's owner is its maker and a folder's is its maker.
Its owner, owners and admins share a template or folder with an active sender, found by email, to use (see and send from it) or to edit (also save its next version, `TMPL-003`); sharing again changes the access and removing a share takes it back.
A folder share covers every template in it, a folder's owner edits the templates in it, and a person's access is the highest of their template and folder shares.
Owners and admins reach every template already, and viewers and agent tokens have no templates (403), so neither is shared with.
Only a template's maker, owners and admins delete, share or move it, and only into a folder they own or may edit; anyone who may edit a folder saves new templates into it; people it is shared with cannot share it on.
Each share records who granted it and when; the account audit log of grants is `ADMIN-005`'s.
A template has up to 10 tags of 1 to 40 characters, set by whoever edits it.
Search on the Templates screen and `GET /api/inkwell/templates?q=` keeps the templates whose name or a tag contains the text, ignoring case, among only those the person may use, and `folder=` keeps one folder (`personal` for their own); a template a person may not use is not found by search, list, document, send or match (404).
Group shares join folders and templates through `ADMIN-002`'s groups before they ship.

## TMPL-003

Template versions that never change sent envelopes

Editing a template creates a new version; envelopes already sent keep the version they were sent from, and the record names it.
A sent envelope can be saved as a new template.
An edit, from the template's own edit screen, replaces its PDF, roles, fields and settings and raises its version by one (a new template is version 1); the template keeps only its latest version, and each earlier version lives on in the envelopes sent from it, which hold their own bytes, fields and settings, so no edit reaches them.
The envelope and its prepared event name the template's ID, name and version.
Its maker, owners, admins and people it is shared with to edit (`TMPL-002`) edit it; a share to use does not.
Anyone who makes templates saves a native envelope they may read as a new version-1 template from its detail page: its original PDF; its recipients still on it, as roles in the same routing order with their access-code setting and private message, named as in the template the envelope came from or otherwise Signer 1, Signer 2 and so on; their fields; and its subject, message, reminders, options and expiry length in whole days (1 to 365).
SEND-001 also pins prepared and held envelopes to their older bytes and definition; a template edit requires fresh eligibility confirmation at release, and that confirmation never substitutes the newer template content.

## TMPL-004

Several templates in one envelope

A sender applies two or more templates to one envelope in a chosen order, alongside any ad hoc documents (`PREP-002`).
Recipients whose role name and routing order match across templates merge into one recipient, and a preview shows the merged recipient list before sending.
When templates disagree (a role at different orders, different identity methods, reminders or expiry), the preview names the conflict and the sender chooses; without a choice, envelope-level settings follow the first template and identity follows the stricter method.
Each template's fields stay on its own documents.
The record and certificate name every template and version used.
Exact semantics: role names match after trimming, with case preserved.
Conflicting orders stay separate by default; the sender may merge at an order present in the sources.
A routing resolution re-proposes the stricter identity.
All source approval rules and live revision fences apply regardless of the chosen envelope defaults.
Additional PDFs enter for review and may receive fields when the prepared draft is edited.
Source versions survive copy, draft edits and archive restore.
AGENT-007 inherits composed-source field mapping before generating per-source maintenance suggestions.

## TMPL-005

Template matching on upload

When a sender uploads a document that matches a template's document (by fingerprint or by page-text similarity), Inkwell offers that template's fields and roles, with the match confidence; the sender applies or ignores the offer, and nothing is placed without their choice.
Exact semantics: an upload on the prepare screen is compared with each document of every template the person may use (`TMPL-001`, including those shared with them, `TMPL-002`).
The same file is its SHA-256 fingerprint, confidence 100%.
Otherwise, when the upload has the same number of pages as the template's document at the same sizes (within one point, so every field lands where the template put it), the two are compared by page text: the words their text operators show (letters and digits, case ignored, one byte per character), as the share of distinct three-word runs they have in common (Jaccard), offered from 80% and shown rounded down to a whole percent; each document needs at least 20 words, so a scan with no text matches only by fingerprint.
Up to five matches are offered, best first.
Applying one sets one recipient per template role, in its routing order with its private message and access-code requirement (the send asks for that person's code), keeps any name and email already typed in that place, and places every field belonging to the matched document where the template put it; the envelope's other settings stay the sender's, and it is an ad hoc envelope, not a send from the template (`TMPL-001`'s record).
Matching places and stores nothing.
Later upload formats (`PREP-001`'s Word and images) and `PREP-002`'s added documents use the same matching door; a component match applies that component’s fields, while combining whole templates belongs to TMPL-004.

## ROUTE-001

Any number of recipients and roles

An envelope has up to 100 recipients, each with a role: signer, approver (approves without signing), form filler, witness (nominated by the signer they witness, `ROUTE-010`), in-person signer, specify-recipients agent, editor, needs to view (`ROUTE-011`), or receives a copy.
Copy recipients receive the completed record and no action link; each recipient sees only their own actions and only the documents visible to them (`ROUTE-012`).
Each role added here carries `ROUTE-003`'s include rules (a signer's rules for roles that act, a copy recipient's for roles that only receive) before it ships.
Acting roles are signer, in-person signer, approver, form filler and signer-nominated witness, plus the specify-recipients, editor, needs-to-view and certified-delivery actions implemented under `ROUTE-011`’s conservative default pending ct approval, with the same count, routing, own-action and document-scope boundaries.
Reserved witness places count toward the 100-recipient limit.
Approvers confirm approval without fields or a signature; form fillers complete only their assigned business fields without adopting a mark.

## ROUTE-002

Sequential, parallel and mixed order

Recipients share or differ in routing order: equal numbers act in parallel, higher numbers wait for all lower ones to finish.
A routing order is a whole number from 1 to 100 set per recipient, in any list position and with gaps allowed; a recipient given none takes their list position (1 for the first).
Whoever is unsigned at the lowest open order is invited together, each with their own link and authentication, and the next order is invited once every one of them has signed (electronically or by an accepted paper scan, `SIGNX-008`); a copy keeps each recipient's order (`PREP-010`).
An envelope saved before routing orders existed signs one recipient at a time in list order.

## ROUTE-003

Conditional routing

A routing rule includes or skips a recipient based on a field value (for example, amounts over 10,000 USD add the finance director).
Skipped recipients are recorded with the rule that skipped them.
A rule is one field compared by equals or does-not-equal, or, for a USD number field, by greater than, less than, at least or at most, using `PREP-004`'s exact cents (the comparison value is kept to two decimals; a checkbox compares with true or false).
A signer's rule reads only immutable sources: a locked `PREP-008` prefill, decided at approval, or a field completed by a signer at a lower routing order, decided in the same commit as that signature.
A locked source that is missing or hidden refuses the approval; a lower-order answer that resolves to nothing stops the route with an explicit unresolved condition until the sender corrects it (`DELIV-006`), never a silent include or skip.
A skipped signer is not a party: no invitation, code, action, completed-copy mail or link (`DELIV-007`); their placed fields neither print nor need completing; the skip (field, comparison, value, result with the source value, and time) is in the audit trail and on the certificate the parties receive.
A copy recipient may carry the same one-field rule, evaluated once at completion against the final values (locked prefills and every completed field): false means no completed-copy mail or link, recorded on the certificate like a skipped signer; a source still missing or hidden at completion sends the copy, since a copy carries no signing authority, and the certificate records "rule unresolved, copy sent".
With mail not set up no copy is sent, and the certificate says no completed-copy email was queued.
Before sending, the template, send and approval screens show a routing preview of who is included or skipped on the current locked values and who still waits on a signer's answer.
Copies of an envelope and templates made from or sent with it keep the rules and reset the outcomes.
A signer's rule changes only by an audited `DELIV-006` correction while that signer's turn is not yet activated and they have neither signed nor been skipped; no correction revives a skipped recipient or changes a field already used to decide.
The recipient roles `ROUTE-001` and `ROUTE-011` add carry these rules before they ship.

## ROUTE-004

Internal approval before sending

A template or account rule can require a named approver to approve an envelope before it goes to external recipients, with approve and reject (with reason) actions and an audit entry for each.
The exact semantics: the account rule is set or cleared by an owner or admin and kept with who set it and when; a template's rule is saved with the template's version by whoever may edit the template, and every envelope prepared from it carries it through draft edits, copies (`PREP-010`) and templates saved from it.
A rule names one approver, an active owner, admin or sender (never a viewer), and optionally a threshold: a USD number field's label (ignoring case and surrounding spaces) and an amount.
A rule without a threshold covers every envelope; one with a threshold covers an envelope with a number field of that label whose value is a locked sender value (`PREP-008`) strictly above the amount, or is not a locked sender value (its amount is not known before sending); an envelope without such a field is not covered.
The account rule and the envelope's template rule both apply, and each distinct approver they name must approve.
The person whose eligibility confirmation authorizes the send (`SEND-001`) remains its authority; while any named approver has not approved, the draft waits, locked against edits and a second approval, with no invitations, links or in-app signing, and it can still be voided or expire.
Each approver is notified (`DELIV-008`, an 'Internal approval' notice by email unless they turn it off) and finds it in their waiting-for-me list (`MANAGE-003`).
The last approval sends it exactly as the confirming person's approval would have (a scheduled time that has passed sends at once); one rejection, with a reason of 3 to 500 characters, returns it to its sender as an editable draft with the reason shown and notified, and approving it again makes a new request.
When the confirming person is a named approver, their confirmation is that approval and is recorded so.
A pending request keeps the rules as they were when it was made; each approver's role is checked again when they decide.
Anyone a request named may read the envelope from then on, including after deciding, but never edit or share it.
The request, each approval and each rejection are audit events naming their actor, and the send's approval event lists the approvals.
`ADMIN-004`'s sending policies require an internal approval through these rules, as `SEND-001` states.

## ROUTE-005

Signing groups

A recipient can be a signing group; any one member signs for it, and the record names who did.
The exact semantics: owners and admins keep named groups in Settings (a name unique ignoring case, 2 to 10 members, each a name and a distinct email, workspace members or not); a sender chooses a group instead of a person for a recipient place, and the draft snapshots the group's name and members each time it is saved, so a later change to the group never changes a prepared or sent envelope (a copy, `PREP-010`, keeps its source's snapshot until its draft is saved again).
The group takes one routing place (`ROUTE-002`) and counts as one of the envelope's signers; nobody may sign both alone and in a group on one envelope.
At its turn every member gets their own link and verifies as the place's method requires (an emailed code, or the link alone under `IDV-001`); access codes, in-person signing and reassignment are refused for groups in v1, and so is a group while mail is not set up, because each member's link and code go by email.
The first member to sign (electronically, or with a paper scan the sender accepts, `SIGNX-008`) completes the place; the other members' links then show "Signed for <group> by <member> at <time>" and can no longer sign, open the document or download the completed files.
A member's decline or withdrawal of consent declines the envelope, naming that member.
Reminders (`DELIV-003`) and resends (`DELIV-005`) go to every member while the place is open; the completed copy (`DELIV-007`) goes to the member who signed, not the others.
A correction (`DELIV-006`) keeps an unsigned group place as it is or removes it; it never changes a group's members and cannot add a group.
The certificate names the group, the member who signed or declined with that member's authentication evidence only, and every member invited.
`ROUTE-003` include rules apply to a group place as to a person.
A template role may be filled by a group when sending (`TMPL-001`), and `MOVE-002` imports Docusign signing groups as these groups before it ships.

## ROUTE-006

Delegation and reassignment

When the sender allows it, a recipient reassigns their action to someone else with a reason; the sender can also replace an unsigned recipient (a `DELIV-006` correction).
The original recipient's link stops working and the record shows both people.
Exact semantics: the sender turns reassignment on per envelope when preparing it, and it is off otherwise (the account default joins `ADMIN-004`); a recipient reassigns from their signing page while it is their turn, after verifying, like every other recipient action; the new person takes the same place, routing order, fields and private message, and the same access code when the sender set one (the sender shares it with them); they are invited at once on their own link and verify their own email, and nothing the original recipient verified or agreed to carries over; the new email may not already belong to a recipient or copy recipient of the envelope; reassignment needs mail set up, since the new person can only be reached by email; the audit trail, the detail page's timeline and the certificate name both people, the time and the reason, and the person who now holds the place may reassign again while it is their turn.

## ROUTE-007

Hosted in-person signing

A team member hosts an in-person signer on their own device or a tablet; the signer’s identity is attested by the host, and the record names both.
The sender marks the recipient in person when preparing; their name and email remain required for the record and completed copy, but no invitation, reminder or resend is emailed to them.
At their routing turn, a member who may edit the envelope (`ADMIN-001`) attests “I confirmed <name>’s identity in person” by government photo ID or personally known to me; no ID image or number is kept.
The host must be a different person: neither their email nor user may match the signer.
The handoff revokes the host’s app session and opens the ordinary signer page in a session scoped to that one envelope and signer, for up to 24 hours.
The hosted device can read only that signing request, cannot navigate into `/app` or read other app data, and receives no saved host signature.
The signer agrees to a separately versioned hosted disclosure that names the sender and their email for direct paper-copy requests, withdrawal and contact changes (with the host able to help them reach the sender); its exact displayed words are fingerprinted, and the remote disclosure is unchanged.
The signer signs themselves; signing, declining or withdrawing consent ends the hosted session and returns the device to the host’s sign-in.
A correction keeps in-person versus remote mode after approval (changing that mode requires a new prepared envelope and approval); a corrected attendee needs a fresh host attestation.
An in-person signer cannot reassign remotely; the sender may correct who attends.
The audit trail records the host, their sign-in method, attestation method and time, IP, user agent and browser-reported screen size.
The certificate reads “Signed in person, hosted by <host>; identity attested by the host, not verified by Inkwell”, with the attestation method and time and device information labeled “as reported by the browser”.

## ROUTE-008

Contacts and recent recipients

Senders pick recipients from a shared contact book and recent recipients, with name, email, phone and company; contacts can be imported from CSV and synced from the CRM.
The book is one per account: owners, admins and senders read, add, change, remove and import contacts, and viewers and agent tokens cannot (`ACCESS-001`).
A contact is one email, kept in lower case, with a name (up to 160 characters) and an optional phone (digits, spaces, brackets, dots or dashes with an optional leading +, up to 40 characters) and company (up to 160); saving or importing an email already in the book updates that contact.
A CSV import is UTF-8 text up to 1 MiB whose first row names the columns, name and email and optionally phone and company in any order (other columns are ignored), then up to 1,000 rows; each invalid row is reported with its line number and nothing of it is saved.
While preparing, the sender searches the book by name, email or company (case-insensitive, contains) and adds a contact as a signer or as a copy recipient; with nothing typed they see their recent recipients, the last 20 different signers and copy recipients on envelopes they prepared, newest first, with the book's company.
Contacts are installation state and do not travel in an archive.
Syncing from the CRM arrives with the CRM connectors: `INTEG-001`, `INTEG-002` and `INTEG-003` each bring their contacts into this book before they ship.

## ROUTE-009

Sign it yourself

A signed-in member signs their own document with nobody else involved: they upload it (or pick it from a connected store or mailbox add-in, `INTEG-004`, `INTEG-005`), place their own fields, and sign in the app with no invitation and no mailbox code, because their signed-in session (and its sign-in method: email link, passkey or SSO, with any second factor under `ADMIN-009`) is the authentication, which the certificate records.
They then download the executed PDF and certificate, file them, and optionally send the completed copy to other people.
A member's adopted signature and initials are saved to their profile and reused for later self-signing and in-app signing (`MANAGE-003`) until they change them.
When the sender is also a recipient at the first routing order of their own envelope, they sign in the app immediately after approving it, with no email to themselves, and only then is the next order invited.
Here the sender is the member who approves: every first-order recipient whose email is theirs is left out of the invitations and signs in the app, so a self-signed envelope (approved, then signed by its only recipient) sends no message, and the envelope's own sender is never emailed its completed copy because their account files it (`DELIV-007`).
The certificate states the session's sign-in method as Inkwell records it: an emailed invitation link, an emailed sign-in link, owner setup, single sign-on (OIDC), a password, local development sign-in or review sign-in; passkeys and second factors are added to it by `ADMIN-009` before it ships.
The saved signature is the typed name a member last signed with through their session; it is offered for their next in-app signing, and signing with another replaces it; the record and certificate say when it was reused.
Picking a document from a store or mailbox arrives with `INTEG-004` and `INTEG-005`, each before it ships.
The completed copy goes to 1–20 more people, within the envelope's 20 copy recipients, by whoever may change the envelope, through `DELIV-007`'s delivery, and the record names who sent it.
Saved signatures are installation state and do not travel in an archive.

## ROUTE-010

Witnesses nominated by their signer

The sender requires or allows up to two witnesses for a signer.
The signer nominates each witness by name and email while signing (or the sender names them in advance), and a witness cannot be the signer or another recipient of the envelope.
A witness is invited only after their signer signs and before any later routing order proceeds, authenticates with the method the sender set (`IDV-001`), sees only the documents their signer signed with that signer's completed signature and their own witness fields (signature, printed name, date and, when set, address), and signs.
If a witness declines, the step returns to the signer to nominate someone else.
The certificate links each witness to the signer they witnessed, with both parties' authentication evidence.
Witness signature, printed-name, date and optional address fields are placed in unused space on the signed documents; a free-form witness places their own fields under `PREP-011`.
A declining witness loses their link and returns nomination to the original signer (the signing member for a group), with the earlier signature fixed.
Copies and templates keep the sender's witness requirement and reset nominations and witness actions; archives retain the signed witnesses and their document grants.

## ROUTE-011

Recipients who name, edit or only view

Besides signers and approvers, a recipient can be a specify-recipients agent, who enters the names and emails of later recipients the sender left open; an editor, who may change later recipients, their fields and the messages before passing the envelope on, with every change audited; needs to view, who must open the documents before routing continues; or certified delivery, who must open them and whose opening is recorded as proof of delivery.
Each of these roles carries `ROUTE-003`'s include rules, as a recipient who acts, before it ships.
Adopted default pending ct approval: only a signed-in owner/admin creates explicit grants to existing later recipient places.
A naming agent fills only identities left open by that sender; an editor changes only granted, unactivated later identities, private messages and fields on documents visible to both editor and target.
They cannot add recipient places, delegate authority again, change roles, routing, authentication, account permissions, original bytes or document audiences, or change an envelope-wide message after earlier action.
Each action needs the current recipient's authentication, disclosure agreement and explicit audited consent.
A skipped naming agent leaves any unresolved identity held for sender correction, with no invitation.
Needs-to-view and certified-delivery steps complete only after successful authenticated PDF-opening requests cover every visible original component; the record and certificate say this observes a PDF request and does not assert human reading.
Repeated requests are idempotent.
Copies/templates retain grants and reset open identities and actions; signed custody and restore bind grants, edits and openings to the audit trail.
`ADMIN-004` and future `API-003` recipient doors inherit these grant and document-scope boundaries before shipping.

## ROUTE-012

Document visibility per recipient

In a multi-document envelope the sender chooses which documents each recipient may see; by default a recipient sees every document, and an account policy can hide documents in which a recipient has no fields.
Hidden documents are absent from that recipient's signing view, downloads, completed copy, embedded view and API recipient view, and the certificate states which documents each recipient was shown.
Exact semantics: document audiences are saved by recipient place (a signing group uses its place), with separate copy-recipient selections; omitted audiences mean all recipients.
Hidden documents cannot contain that signer’s fields or a required signature for them.
The owner/admin’s versioned envelope-default setting can narrow selected audiences to recipients with fields when a draft or template is saved or used; a copy recipient has no fields and then receives only a scoped certificate.
Existing saved records and sent envelopes keep their visibility.
Signing views and PDFs use consecutive visible-page numbers, mapped back to canonical pages for fields, progress and comments.
Per-document URL guesses are refused, and recipient certificates omit hidden document names and field evidence while the record-holder certificate lists every recipient’s visible documents.
Page threads cannot be shared with a recipient who cannot see their document.
A paper scan accompanies a recipient bundle only when every document its uploader could see is visible to that recipient; recipient component downloads exclude any scan whose uploader could see a hidden document, while the record holder retains the full original component and scan record.
Corrections preserve the signer place’s grant and reindex copy grants by the existing copy email; new corrected copy recipients receive no restricted documents.
A sender’s explicit post-completion copy action chooses its documents (all by default), with the audience change audited.
Draft edits, copies, template save/use/edit, archive verification, holds, retention and erasure carry the same scope.
`ROUTE-001`, `ROUTE-010`, `ROUTE-011` and `API-003` inherit the restrictions for every future role and embedded recipient door before shipping.
`PREP-003` inherits this visibility boundary before attachment sharing ships; visibility of a parent document alone never grants attachment bytes, and today’s uploader/record-holder-only attachment rule remains the default.
No attachment upload or wider byte sharing is claimed by this clause.

## SIGNX-001

Guided mobile-first signing

Signing works on a phone at 360 pixels without zooming: a Start and Next button walks the signer through every required field, a progress count shows what remains, the document pages render sharply and load progressively, and the signer can finish later from the same link.
Start, then each Next, goes to the next of the signer's required fields still empty in reading order (by page, then top to bottom, then left to right), scrolls the document to it and puts its entry at the foot of the screen; after the last, Next goes to the consent.
Every field placed today is required; optional fields (`PREP-003`) and fields a signer places themselves (`PREP-011`) join Next and the count before they ship.
The count reads how many of the signer's required fields are complete and how many are left.
Each Next, and Finish later, saves the signer's entries on the server; reopening the same link (after the same verification as signing: the 24-hour signing session, or a new code) brings them back, and Start resumes at the first empty field.
Saved entries sign nothing, are not evidence and are not archived; they are cleared when the signer signs, electronically or on paper, or the envelope is declined or voided.
Pages appear as each one loads and are drawn only near the screen, at the screen's pixel density up to 3x.
Time to first page runs from opening the signing link to the first page drawn; the throttled mobile profile is a 390 by 844 pixel screen at 3x density with touch, the CPU slowed 4x and the network held to 150 ms round trips, 9 Mbit/s down and 1.5 Mbit/s up (Chrome DevTools Protocol), on a cold HTTP cache.

## SIGNX-002

Draw, type or upload signatures and initials

The signer adopts a signature and initials by typing (choice of styles), drawing with finger or mouse, or uploading an image; the adopted marks are applied to every signature and initials field, and the record keeps the adoption method.
A signed-in member's adopted marks are saved and reused (`ROUTE-009`).
The signer enters their full name in each signature field (the same name in all of them) and adopts one mark: the name typed in a style (Sans italic, Serif italic or Serif bold italic, set in the PDF standard fonts), a drawing made on the signing page with a finger, pen or mouse (kept as a PNG cropped to the ink), or an uploaded PNG or JPEG of at most 512 KiB (524,288 bytes).
The executed PDF carries that mark in every signature field: a typed name in its style, or the image centered in the field and scaled to fit with its proportions kept.
A signer who adopts nothing is typed in Sans italic, as every envelope signed before adoption existed was.
The mark is adopted at signing: Finish later (`SIGNX-001`) keeps the names entered but not the adopted mark.
The record keeps the method, the typed style or the image's type and SHA-256, and the image itself with the envelope's documents (so it travels in archives and is erased with the envelope); the certificate states each signature's method with its style or fingerprint (`RECORD-002`).
A member's saved mark keeps its method and image and is offered on their next in-app signing.

## SIGNX-003

Accessible signing

Signing and preparation meet WCAG 2.2 AA: keyboard-only completion, screen-reader labels for every field and its state, visible focus, 200% zoom without loss, and sufficient contrast in both themes.
The scan is axe-core's WCAG 2.0, 2.1 and 2.2 A and AA rules (contrast included), run on the preparation page and on each signing step (code, disclosure, fields) in the light and dark themes at 1440 and 390 pixels, and passes with no violation rated serious or critical.
Keyboard-only means Tab, Enter, Space, letter keys and typing: the owner prepares (title, PDF through the file chooser, recipient, a field placed on each of two pages with Enter, field type chosen by keyboard), approves and the signer verifies, agrees, signs through Start and Next and signs, and every control reached shows a focus outline or ring (a date field's calendar button shows the browser's own).
The screen-reader journey reads the browser's accessibility tree, the same one screen readers use, with no operating-system screen reader: each of the signer's fields is named with its label, page and type and is required, its entered value is exposed, the progress count is a live status, the adopted signature style and the consent expose their checked state, and the signer completes the envelope by roles and names alone.
200% zoom is a 1440 by 900 screen at 200%, 720 by 450 CSS pixels at 2x density: preparation and signing show without sideways scrolling, as they do at 390 and 360 pixels (`SIGNX-001`).
Beside the document, the signer's fields panel scrolls within the space the guide leaves, so the guide never covers the consent or Sign document.
Screens that later clauses add to signing or preparation (`PREP-003`'s field types, `PREP-005`'s drag and resize, `SIGNX-007`'s Spanish pages, `SIGNX-009`'s comments) join this scan and these journeys before they ship.

## SIGNX-004

Decline with reason

A signer declines with a required reason; the envelope stops, the sender and earlier signers are notified, and the reason is in the record.

## SIGNX-005

ESIGN and UETA consumer disclosure

Before first signing, a signer reviews the account's electronic record and signature disclosure (how to withdraw consent, request a paper copy, update contact details and the hardware and software needed) and agrees to it; the disclosure version and agreement time are in the record.
A signer can withdraw consent, which stops the envelope and notifies the sender.

## SIGNX-006

Branded sending and signing

An account brand sets logo, colors, sender display name, reply-to address, email footer and a custom sending domain; brands can differ per template.

## SIGNX-007

English and Spanish signing

Signing pages, emails, disclosures and the certificate are available in English and Spanish, chosen per recipient or by the signer.
The Spanish signing pages join `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before they ship.

## SIGNX-008

Signer document actions and paper signing

Before and after signing, a signer can download and print the documents visible to them (`ROUTE-012`).
When the sender allows it, a signer can choose to sign on paper instead: they download the documents, sign them by hand, and upload a scan or phone photo; the sender reviews and accepts or rejects the upload, and the record marks that recipient's signature as wet ink with the uploaded pages' fingerprint, which the certificate states.

## SIGNX-009

Recipient comments and supplemental documents

Recipients and the sender exchange comments on a document while it is out for signature, threaded and anchored to a page, visible to the parties the author chooses and kept in the record.
The sender attaches supplemental documents (terms, policies, a handbook) that recipients must view or acknowledge but do not sign; each acknowledgment is recorded.
Approved audience, identity and custody rules: the author explicitly selects the sender and/or recipient identities who may read a thread, and replies inherit that audience.
Sender, owner/admin and edit-share authority never grant automatic thread-text access; an owner or admin outside the chosen audience cannot read it.
Audiences are bound to the recipient's email plus the latest identity-changing correction or reassignment event, so a replacement never inherits threads or acknowledgments.
Thread writes are allowed only while awaiting signature; the terminal transcript is immutable.
Multiple rounds are allowed.
Supplemental PDF bytes travel through `PREP-010` copies and `TMPL-001`/`TMPL-003` template save, use and edit, with acknowledgment state reset for the new envelope or identity.
The account audit (`ADMIN-005`) records thread create, reply, share and audience-change events with opaque actor, time, document and recipient indices, and no thread text.
Thread text is readable only by its chosen audience; export, custody and erasure of the document include threads and supplements, and the archive travels with the record holder under the document's own access.
The certificate lists each supplement's title and fingerprint and each acknowledgment and time, never thread text.
Comments and supplemental documents join `SIGNX-003`'s accessibility scan and its keyboard-only and screen-reader journeys before they ship.
Current supplemental-document slice: the sender adds up to 20 reference PDFs, each at most 2 MiB in the existing D1 custody, to an unlocked prepared envelope.
Each document declares view or explicit acknowledgment required; requesting approval fixes these bytes and requirements.
A verified recipient who accepted the existing disclosure opens the fingerprint-checked PDF; this records that the application served it, not proof the person read or understood it.
Explicit acknowledgment requires that opening first.
Electronic and paper signing refuse unmet requirements for that recipient and identity; a replacement recipient starts again.
The certificate lists every reference document fingerprint and each recipient’s opening and acknowledgment times, without adding the reference pages to the signed PDF.
Copies, drafts, templates, archives, verification and erasure retain the document custody; new envelopes retain no earlier acknowledgment.
Page-anchored threads now use explicitly selected sender and/or recipient identities; the thread author alone changes the audience, and replies inherit it.
The author is not added implicitly.
A correction changing the name or email, or a reassignment, starts a new recipient identity epoch even when a mailbox is reused.
Comments are separate from envelope summaries and audit JSON; account comment-audit exports contain opaque metadata and transcript fingerprints only.
The explicit Record custody export and whole-installation archive carry the complete transcript under the document record-holder’s existing access; custody restoration never grants interactive comment access to the destination owner.
ADMIN-005 inherits these comment-event metadata and custody rules before its account-wide log ships.

## IDV-001

Per-recipient authentication choice

For each recipient the sender chooses none (link only, as the incumbents default to), email code, access code, SMS code, knowledge-based or phone authentication (`IDV-005`) or identity verification, with account defaults (`ADMIN-004`) and template settings; the first-release email code (`SIGN-001`) is one of these methods, not a requirement on every recipient.
The certificate records the method and outcome.
Exact semantics today: on the prepare screen, a draft, a correction and each template role, the sender picks Email code (the default) or Link only for each recipient, and independently an access code (`IDV-003`), giving four methods: link only, email code, access code with the link alone, and access code with email code.
A link-only recipient opens a 24-hour signing session from their link alone (after their access code, if any) with Continue; no code is sent or asked, and the opening is recorded with the client's network evidence.
The sender is told "Anyone with this link can sign as" that recipient.
Hosted in-person recipients instead use the host attestation and isolated session of `ROUTE-007`, selected on preparation; no email or link-only verification replaces the host’s attestation.
Link only is refused while mail is not set up, where the owner's once-visible link would be the only factor.
Changing a recipient's method in a correction is a new link (`DELIV-006`).
The certificate's authentication line names each recipient's method and outcome ("link only, no code … opened", "emailed verification code, verified", "Access code: entered at"), as does the envelope timeline (`MANAGE-005`).
SMS codes (`IDV-002`), knowledge-based and phone authentication (`IDV-005`) and identity verification (`IDV-004`) join this choice before they ship, and the account default is `ADMIN-004`'s.

## IDV-002

SMS one-time codes

A recipient verifies with a code sent by SMS to a US mobile number through the buyer's Twilio account or Inkwell's registered sender, with resend spacing, expiry and attempt limits matching email codes.
The recipient's number is corrected in flight like their email (`DELIV-006`), and the sender resends the invitation by SMS like by email (`DELIV-005`).
It joins `IDV-001`'s per-recipient choice (prepare screen, drafts, corrections, template roles) and the certificate's method and outcome line before it ships.
SMS follow-up inherits AGENT-003’s explicit grant, contact limits, allowed windows, immediate revocation, identity and reply-custody rules.
Exact semantics: SMS is an individual remote recipient method, separate from email/link-only and independently usable with an access code.
Each request is spaced by a minute, expires in ten minutes, permits five attempts and has at most ten code generations per invitation.
Correcting a number rotates the link, code and session; reassignment retains the SMS method and requires the new person’s number.
Template roles retain the method, and the sender supplies the number when using them.
Twilio sends are durably claimed once; uncertain sends are never retried.
Certificates use the masked number and recorded verification result.
SMS follow-up grants bind current numbers and must be renewed after correction; signed Twilio replies require a per-identity capability and exact current number, with private custody and no automatic reply.

## IDV-003

Access codes

The sender sets an access code shared out of band; the recipient must enter it before seeing the document, with attempt limits.

## IDV-004

Identity document verification through a provider

A recipient verifies a government photo ID and a selfie through Persona or Stripe Identity before signing; Inkwell stores only the provider's verification reference, result and name match, never the ID images.
It joins `IDV-001`'s per-recipient choice (prepare screen, drafts, corrections, template roles) and the certificate's method and outcome line before it ships.
Implemented semantics: Stripe hosts the document and matching-selfie check.
Before any provider request the recipient explicitly consents, recorded on this invitation.
Only an opaque reference is sent to Stripe; verified document and selfie results plus an exact full-name match after Unicode, whitespace and case normalization admit the recipient.
Pending results do not admit; a failed or mismatched check can be restarted after one minute, at most ten starts per invitation.
Only provider reference, normalized outcome and name-match flag enter the business record, alongside ordinary authentication timing and network evidence.
No provider payload or images are retained.
Other authentication routes cannot bypass the selected method.
Provider methods are preserved by drafts, corrections, copies and templates; a combined role with conflicting provider methods requires the sender to choose explicitly.
RECORD-005, PORT-001 and ERASE-001 carry the same reference-only business custody; provider credentials and active sessions remain installation state.
CT policy ruling, 25 October 2026: APPROVED WITH RIDERS.
This approves the product defaults below only.
Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.
**Approved product default and riders.** Stripe Identity hosts government photo ID collection and the matching-selfie check.
Persona remains a supported-provider target, not an implemented-provider claim.
Only the recipient using the current invitation’s authorized signing session may consent and start verification.
A sender, administrator, API credential or agent cannot consent or complete verification for that recipient.
Before the first provider request, show an unchecked consent control with this wording: “I agree to continue to Stripe Identity to verify my government photo ID and take a selfie.
Stripe collects and processes these directly under its privacy notice.
Inkwell keeps the verification reference, result and whether my name matched, plus consent and authentication audit evidence.
Inkwell does not keep my ID images, selfie or provider response.
Verification is required to continue with this signing request.” Link the applicable provider privacy notice and identify the configured provider before consent.
Declining sends no verification request and grants no admission.
Compare the provider’s verified full name with the invitation’s recorded recipient full name using Unicode NFC normalization, Unicode case folding, trimming and collapse of Unicode whitespace runs to one space.
Require exact equality of the resulting nonempty strings.
Do not remove accents, punctuation, hyphens, apostrophes, titles or suffixes; do not reorder names, transliterate, expand initials or apply fuzzy matching.
Missing or ambiguous verified names refuse admission.
A mismatch refuses admission and permits a new provider attempt under the existing one-minute spacing and ten-start limit; it never rewrites the recipient’s name or permits manual approval.
Admission requires authenticated provider proof that the current invitation’s bound session passed both document verification and matching-selfie verification and passed the name comparison.
A browser return, pending result, unknown result, expired session, invalid callback, replay or result for another invitation never admits.
An unfinished provider session expires no later than 24 hours after creation and earlier when its provider expiry, invitation validity or envelope validity ends.
Expiry never renews admission or resets a start limit.
These limits are product choices.
Retain only the provider reference, normalized outcome and name-match flag as provider-derived business evidence.
Consent version and exact wording or its immutable version reference, recipient and invitation identifiers, provider and method, actor, timestamps, authentication network evidence, and normalized start, expiry and refusal events form the ordinary audit evidence.
Do not retain verified provider names, ID numbers, document images, selfies, biometric data or raw provider responses in records, logs, traces, mail, command receipts or archives.
The certificate states the method and result without claiming notarization or legal identity certification.
Apply RECORD-005, PORT-001 and ERASE-001 without creating a separate identity retention period.
Restored references preserve historical evidence but grant no active authentication; restored unfinished invitations require fresh consent and fresh provider proof.

## IDV-005

Knowledge-based and phone authentication

For US recipients the sender can require knowledge-based authentication (questions from public and credit records through an identity provider such as LexisNexis Risk Solutions) or phone authentication (a code delivered by voice call or SMS through Twilio to a number the sender sets).
Attempts are limited, a failed recipient is locked with a notice to the sender, and Inkwell stores only the provider's reference and pass or fail, never the questions or answers.
It joins `IDV-001`'s per-recipient choice (prepare screen, drafts, corrections, template roles) and the certificate's method and outcome line before it ships.
Implemented semantics: Authenticate hosts US knowledge questions in the configured mandatory-KBA workflow.
Explicit audited recipient consent precedes transmitting name, email and transient date of birth; questions and answers never enter Inkwell.
The authenticated applicant, actual workflow and session are bound to the invitation and checked on every result.
For each completed unsuccessful hosted session, its reported attempts.availed (at least one) accumulates across replacement sessions; two lock the invitation and atomically write one sender Activity notice and configured email.
Twilio Verify delivers voice-call codes to the sender-set US number; five incorrect checks lock and notify.
Calls and hosted flows require explicit consent, one-minute spacing and at most ten starts; uncertain creation is never retried automatically.
Hosted capability tokens are sealed under the installation key and excluded from archives; only references and outcomes enter the record and certificate.
A correction rotates the invitation and resets its authentication.
CT policy ruling, 25 October 2026: APPROVED WITH RIDERS.
This approves the product defaults below only.
Implementation, provider operation, legal suitability and release acceptance remain separately evidenced; this clause remains partial.
**Approved product default and riders.** Authenticate hosts the configured mandatory knowledge-based authentication workflow.
Other named knowledge providers remain targets until separately proved.
Only the recipient using the current invitation’s authorized signing session may consent and start the hosted workflow.
Before transmitting identity details, show an unchecked consent control with this wording: “I agree that Inkwell will send my name, email address and date of birth to Authenticate to start its hosted identity questions.
Authenticate processes those details and my answers under its privacy notice.
Inkwell uses my date of birth only to start this check and does not retain it, the questions or my answers.
Inkwell keeps verification references, results, attempt counts and consent audit evidence.
Two unsuccessful attempts lock this invitation and notify the sender.
Verification is required to continue with this signing request.” Link the applicable provider privacy notice.
Declining sends no identity details and grants no admission.
Transient details must be excluded from persistence, logs, traces, mail, command receipts and archives, including error paths.
Authenticate admission requires authenticated evidence for the current invitation’s bound applicant, actual mandatory-KBA workflow and current session.
A provider pass without those bindings never admits.
Count every distinct completed unsuccessful hosted session once, adding its provider-reported consumed attempts, with a minimum of one.
Count across replacement sessions.
Repeated results do not count twice.
Missing, malformed or contradictory attempt evidence refuses admission and prevents another start until reconciled; it does not count as zero or establish a completed failure without evidence.
Provider cancellation or technical failure is not automatically an identity failure, but remains subject to start limits and deny-by-default admission.
At a cumulative count of two or more unsuccessful attempts, lock the invitation atomically with one durable sender Activity notice and one configured email dispatch record.
Delivery failure remains visible and never unlocks the invitation or erases the notice.
The two-failure limit is a product choice, not a claim of state-law or MISMO compliance.
Voice authentication retains the original five-incorrect-check lock, sender notification, sender-set number and separate explicit call consent.
No questions, answers or verification codes are retained.
A lock has no automatic expiry.
Only an owner, administrator or sender with current correction authority over that envelope may initiate recovery through the existing audited unsigned-recipient correction process, recording a reason.
Recovery creates a new invitation, revokes the old invitation and all its sessions, preserves historical outcomes and lock notices, and requires fresh recipient consent and provider verification.
Nobody may unlock the same invitation by resetting counters, accept a provider failure manually or alter signed evidence.
Changing provider sessions, waiting, restoring an archive or restoring a role does not unlock it.
An unfinished hosted session expires no later than 24 hours after creation and earlier at provider, invitation or envelope expiry.
Expiry does not reset attempt or start counters.
Preserve the existing one-minute start spacing, ten-start limit and refusal to retry uncertain creation automatically.
Retain provider references, normalized outcomes and minimum attempt and lock evidence, with consent version, invitation binding, actor and timestamps; never retain date of birth, questions, answers, codes, raw provider responses or usable hosted capabilities in business records or archives.
Existing sealed capabilities remain installation state only while needed for the active session.
RECORD-005, PORT-001 and ERASE-001 govern business evidence.
Restore preserves historical outcomes and locks, grants no active provider authentication and requires fresh consent for new verification.
**Shared IDV-004 and IDV-005 named Gaps.** - **RON scope Gap:** The pinned contract excludes operating a RON platform.
The full assignment target remains unresolved: US notary commissioning and authority, state eligibility and variations, credential analysis, selfie or liveness requirements, KBA rules, audiovisual sessions and recordings, journals, notarial certificates, seals, tamper evidence, retention, access and portability.
None is satisfied by this policy ruling. - **State and mortgage-market Gap:** State RON rules vary.
Identity proofing may involve credential analysis and KBA, with differing alternatives, thresholds, retries and waiting periods.
Mortgage buyers may also require MISMO-aligned processes, lender and title acceptance, record custody and transaction eligibility.
No jurisdiction-specific legal or standards review was performed; no numeric product default is represented as such a requirement. - **Provider assurance Gap:** A matching selfie is not independently proved liveness or compliant credential analysis.
A hosted KBA pass is not proof that its question sources, scoring or retry controls meet a particular state or buyer requirement. - **Implementation Gap:** Existing test and browser citations are claims in the pinned documents, not executions reviewed here.
The new normalization, expiry, recovery, malformed-result and restore riders need writer evidence. - **Live-operation Gap:** No live provider account, provider acceptance, delivery receipt, paid usage control or installed-provider behavior was verified. - **Privacy lifecycle Gap:** Provider-side retention and deletion require separate disclosure and evidence.
Inkwell’s erasure cannot promise deletion from a provider or copies already exported outside its control.

## DELIV-001

Live delivery with per-message status

Invitations, codes and notices go out through the configured provider and each message shows queued, sent, delivered, opened, bounced or failed from provider events.
Uncertain provider responses are never blindly retried.
Today's providers are Resend, SendGrid and Cloudflare Email; adding Amazon SES, Postmark or SMTP sending belongs to `ADMIN-007`'s provider connections, and each inherits this clause before it ships: per-message status only from that provider's verified events, or this clause's no-confirmation label.
Every message records the provider that accepted it and the message id it returned.
Resend and SendGrid post signed delivery webhooks to `POST /api/inkwell/mail/events`, verified by Base's delivery-event intake with the installation's `MAIL_WEBHOOK_KEY` (Resend's `whsec_` signing secret, or SendGrid's public verification key); every event in a batch must name a message this installation sent to that recipient through that provider (Resend by its returned id, SendGrid by its signed delivery id), or the whole batch is refused and nothing is stored, and a replayed event changes nothing.
Status follows Base's per-recipient delivery state: queued until the provider is called; sent once it accepts (a provider deferral stays sent, labeled delayed); delivered at the provider's delivered time, meaning the recipient's mail server accepted it, not that a person read it; opened at the earliest open the provider reports (Resend with open tracking on; Base's SendGrid sender turns open tracking off, so SendGrid messages stop at delivered); bounced; failed when the provider refuses it at send or later reports failure or suppression; a spam complaint shows as delivered, then marked as spam; uncertain when the provider's answer was unclear, and that message is never sent again automatically.
Times are the provider's event times, stored in UTC.
Labels are honest: Cloudflare Email, as Inkwell sends it, gives no delivery events, so its messages read "sent, no delivery confirmation from this provider" and are never shown as delivered, opened or bounced; a Resend or SendGrid installation without a webhook key reads "sent, delivery events are not set up"; the development outbox reads that it reached no mailbox.
Bounce handling (flag, pause, alert, correct) is `DELIV-002`'s.

## DELIV-002

Bounces and bad addresses

A hard bounce or rejected address flags the recipient, pauses their reminders and alerts the sender, who corrects the address and resends in one step.
Exact semantics: a recipient whose turn it is is flagged while their latest invitation is bounced or failed by `DELIV-001`'s status (the provider reported a bounce, a failure or a suppressed address, or refused the address at send); a provider that reports no delivery events (Cloudflare Email) never flags anyone.
The flag shows on the envelope detail page (`MANAGE-005`); no automatic or manual reminder reaches a flagged recipient; the envelope's sender (the member who prepared it) is emailed once per bounced invitation, from the delivery webhook or, if that alert did not complete, from the next hourly pass.
Whoever may change the envelope (`ADMIN-001`) enters a different address (and optionally name) not used by another recipient; the change is audited with its before and after values, the old link, code and session stop working, and the new invitation goes out in the same step.
Reminders then resume on the envelope's schedule (`DELIV-003`).
Other corrections are `DELIV-006`'s, and the in-app activity feed is `DELIV-008`'s.

## DELIV-003

Automatic reminders

Reminders start N days after a recipient's invitation and repeat every M days, only to recipients whose action is current, within the account's US time zone and business days, and stop at signature, decline, void or expiry.
Account, template and envelope levels set them.
N and M are whole business days from 1 to 30; business days are Monday to Friday in the account's time zone, which is America/New_York until the account setting of `ADMIN-004` lets the owner choose another US zone, and a due reminder goes out on the first hourly pass at or after 09:00 local time.
A recipient's invitation is when the envelope was approved (first routing order) or when the last recipient at a lower order signed (`ROUTE-002`); later reminders count from the previous one.
A recipient whose paper scan awaits review is not reminded (`SIGNX-008`).
The reminder points to the recipient's invitation link; when mail is not set up no reminder is sent or recorded.
The account, envelope and template levels ship: set when preparing, kept by a copy (`PREP-010`), and set by the template an envelope is sent from (`TMPL-001`); the account level is set by `ADMIN-004` and inherited by new envelopes and templates unless explicitly overridden.

## DELIV-004

Configurable expiry with warnings

Expiry is set per envelope, template or account (default 120 days), recipients and the sender are warned before it, and the sender can extend it before or after expiry without re-preparing.

## DELIV-005

Resend by email or SMS

The sender resends the current invitation by email or SMS; the old link keeps working unless the sender rotates it.
Resend is offered among the envelope detail page's actions (`MANAGE-005`), and each resent message shows its own status there (`DELIV-001`).
Exact semantics: whoever may change the envelope (`ADMIN-001`) resends to a recipient whose turn it is, never to one whose invitation bounced (they correct the address, `DELIV-002`) or whose paper scan awaits review, and only with mail set up (without mail the owner creates a new private link, `SEND-001`); Resend emails the same link again, and Resend with a new link rotates it, so the previous link, code, session and access-code pass stop working; both are audited.
To send the same link again, each recipient's current link is kept sealed with AES-GCM under a key derived from the installation's `SESSION_SECRET`, in a secret column that is never archived or exported and is cleared when the link rotates, the recipient signs or the envelope closes; a link issued before links were kept, or kept under another key, is rotated on resend and the sender is told so.
A resend does not move the automatic reminder schedule (`DELIV-003`).

## DELIV-006

Correct an envelope in flight

Before a recipient acts, the sender (or anyone the envelope is shared with for editing, or an admin) changes their name, email or phone, adds or removes later recipients, and edits the messages, expiry or the fields of recipients who have not yet acted, without invalidating signatures already given.
Corrections are the only way a sent envelope changes (`SEND-001`): each is audited with its before and after values, old links stop working, and a field already signed and a signature already given can never be changed.
Correct is offered among the envelope detail page's actions (`MANAGE-005`), and the corrected recipient's timeline continues there.
Exact semantics: a recipient has acted once they signed, declined or uploaded a paper scan awaiting review, and from then on their name, email, routing order, private message and fields are fixed; "later" recipients are those who have not signed, and each may sit at any routing order no lower than the highest order of a recipient who has signed; a removed recipient keeps their place in the record marked removed (their fields go with them) and is never invited, reminded or sent a copy; at least one recipient who has not signed always remains (to stop, void the envelope); a recipient whose name or email changes is a new person at that place, so nothing the previous person verified or agreed to carries over, and their old link, code, session and saved entries stop working (a change of order or private message alone keeps the link); whoever's turn it is after the correction and was corrected, added or newly reached is invited at once on a new link, and a changed subject or message applies to invitations sent from then on; corrections are open while the envelope awaits signature and has not expired (extend it first, `DELIV-004`).
Recipients have no phone number today: `IDV-002` adds the number and correcting it here before it ships.

## DELIV-007

Completed copies to every party

On completion, every recipient and copy recipient receives the executed documents and certificate as an attachment or a secure link (account setting; attachments above 10 MB become links), and the sender's account files them.
An envelope has up to 20 copy recipients today (`ROUTE-001`'s copy role, each email different from every signer's), who get no action link.
The setting is the owner's or an admin's for the whole account (with `ADMIN-004`'s account defaults when they ship), a secure link until changed; with attachments chosen, an executed PDF and certificate together above 10,000,000 bytes go as a secure link.
A secure link belongs to one recipient and opens only after a six-digit code sent to that recipient's mailbox (one a minute, ten per link, each valid 10 minutes with five tries), then stays open in that browser for 24 hours; it works while the envelope exists and stops at erasure (`ERASE-001`).
Copy links and the setting are installation state and do not travel in an archive.
The sender's account files the copies by keeping the executed PDF and certificate on the completed envelope, so the envelope's own sender, when also a recipient, is not emailed one (`ROUTE-009`).
The record names every recipient queued and the delivery used, and each code request and check on a link; when mail is not set up no copy is sent or recorded as sent, and the envelope says so.
Recipients that later clauses add (`ROUTE-001`, `ROUTE-011`) receive the completed copy this way before they ship, and `ROUTE-012` limits each copy to that recipient's visible documents.

## DELIV-008

Sender notifications

Senders get viewed, signed, declined, completed, bounced and expiring notices by email, in an in-app activity feed and, when connected, in Slack, Microsoft Teams or Nook; each person chooses which they receive.
The exact semantics: a notice goes to the member who sent the envelope and every member holding an edit share of it (`ADMIN-001`), for these events: a recipient viewed the document, signed (also on paper), declined or withdrew consent, everyone signed, an invitation bounced (`DELIV-002`), or the envelope expires in three days (`DELIV-004`); every notice is in that member's activity feed, newest first; until a member chooses, email carries declined, completed, bounced and expiring notices and nothing else does; a member is never emailed or posted about their own action (`ROUTE-009`); with mail not set up no notice email is written.
Slack and Microsoft Teams connect by an incoming-webhook URL the member pastes (https on hooks.slack.com, or a Teams or Workflows host under webhook.office.com, logic.azure.com or environment.api.powerplatform.com), Nook by its installation's Slack-compatible incoming webhook (https, path /hooks/slack/, `NOOK-063`); a URL is sealed at rest, shown only masked, never archived and erased on disconnect; a post names the envelope, the recipient and what happened, never a field value or the document's text (an email of a decline also gives its reason); a post is tried at most three times and the feed shows whether it was delivered.
Nook's incoming webhooks are `NOOK-063` in run-nook: until it ships, the Nook leg is proven against a fake that answers as `NOOK-063` documents, and `NOOK-063` carries the Nook test installation passing this journey before it ships.

## BULK-001

Bulk send from a spreadsheet

From a template, a sender uploads a CSV or XLSX of up to 1,000 rows (one envelope per row, with role names, emails and prefill values); a preview validates every row before anything is sent; the sender's one approval of the batch (or the account's sending policy for bulk send, `ADMIN-004`) sends every valid row with no per-envelope approval, and each envelope's record names the batch and its authority (`SEND-001`); the batch shows per-row status, the sender can resend, correct or void remaining rows, and a recipient list can be saved and reused for a later batch.
BULK-001 retains the SEND-001 and ADMIN-004 release duties for every remaining row: current principal authority, contributing policy versions, template revision and sending-definition fences in the invitation transaction; additive internal approval; hold notifications; no automatic revival; and fresh confirmation of the frozen definition and bytes.
Gap: Unproved: complete bulk authority and concurrent release-fence assertions; hold notifications for remaining rows; newly required internal approval at release; permanent non-revival after principal loss; and fresh confirmation preserving the original frozen definition, approval rule and bytes after live template edits or deletion.
The exact-candidate capacity execution is recorded separately in the fleet receipt.

## FORM-001

Public signing web forms

A template becomes a web form with a link, QR code and embed snippet; the signer enters their own name and email, verifies the email, signs, and the envelope can route to a company countersigner.
A submission creates and sends its envelope on its own under the account's sending policy for web forms (`ADMIN-004`), with no per-envelope human approval, and the record names that policy (`SEND-001`).
Forms have submission limits, expiry and Turnstile bot protection, and every submission is an envelope in the dashboard.
Public forms follow scope-review-65 B9.
A form is published by a member with "manage web forms", who becomes its owner and principal, and is pinned to one template version and one public role; every other role is a fixed member or fixed email, so a submission can never add recipients.
A submission gives the submitter's name and verified email, fills the submitter role's fields and signs, and changes nothing else.
Before any envelope exists, Turnstile is verified server-side when a code is requested and on submit, the email code expires in 10 minutes with 5 attempts, and at most 3 codes are sent per email per form per hour.
The owner sets limits: total submissions (100 by default, 10,000 at most), 50 a day by default, expiry (90 days by default, 365 at most), and one submission per verified email per 24 hours; a fixed system limit allows 10 submissions per IP address per hour, and form sends count toward the account's hourly policy-send limit (`API-001`).
Under an autonomous web-form policy the submitter signs and the envelope is sent under that policy; under `person` or `off`, or when held by `ADMIN-004`'s hold rule, the submission is saved as a held draft with no signature and the form owner (or any owner or admin if the owner no longer qualifies) either confirms eligibility, which sends the invitation to the verified email, or voids it.
If the owner is lost the form is suspended and never transferred; it can be republished under a new owner as a new form version.
Unverified attempts are purged after 24 hours, IP address and user agent are kept only as `RECORD-002` evidence, and form statistics are counts only.
Built public form doors: a native owner/admin or explicitly permitted sender publishes an immutable form pinned to the current visible template version, one public signer role and fixed other recipients.
The API returns its public link, SVG QR and iframe snippet.
`/form/:id` uses the existing signing look to collect a name, verify email and continue to the ordinary disclosure/signing page; the signer fills only their role and company recipients countersign normally.
Turnstile is checked server-side at code request, email verification and submission, with action and installation hostname validation.
Codes expire in ten minutes, allow five attempts and are limited to three per normalized email/form in a rolling hour, including failed mail.
Submission consumes the hash-only ten-minute email admission token with the envelope creation, current owner/permission/template and policy fences, total/daily counters, one-per-email rolling 24-hour fence and account-wide ten-per-IP rolling-hour fence.
Total defaults to 100 (maximum 10,000), daily to 50 (UTC calendar days) and expiry to 90 whole days (maximum 365).
Autonomous sends record the form credential, principal and current policy versions; internal approvals recheck that credential and policy at their last release.
Policy-off/person submissions are unsigned held drafts; switching policy back on never releases them.
Only the qualifying form owner confirms eligibility or voids the held draft, with an owner/admin fallback after publisher loss; that fresh personal release retains form provenance and consumes the account send budget.
Owner/role/permission loss permanently suspends the form, never transfers or revives it.
Statistics contain counts only.
Admission PII is purged after 24 hours, hashed IP rate identifiers after one hour, and raw IP/UA appear only in the envelope’s RECORD-002 evidence.
Form configuration, permission and rate/admission state are excluded from document archives; the envelope’s form provenance travels with its record.
ADMIN-005 inherits form/permission change history before its account audit is complete.

## MANAGE-001

Envelope dashboard with search

Senders see drafts, waiting for me, waiting for others, completed, declined, voided and expired envelopes, search by title, recipient, email and custom field, filter by date, sender, template and status, and page through thousands.
A draft is prepared and awaiting approval; waiting for me is the signed-in person's own signing turn (`MANAGE-003`); waiting for others is every other envelope out for signature; an unfinished envelope past its expiry is expired; a person sees only the envelopes their role allows (`ACCESS-001`).
Search matches the title and any recipient's name or email, case-insensitively; the date filter bounds when the envelope was prepared, from inclusive and to exclusive, and the screen sends the viewer's local midnights so the chosen To day is included; the sender filter lists the people owners and admins manage, and viewers filter by sender through the API.
The screen and the API read the same server search, 50 envelopes a page, newest prepared first, with every status count under the current search.
The template filter (`TMPL-001`) narrows the search to envelopes sent from one template: the API takes any template ID (`template=`), and the screen lists the templates the person may use.
Custom-field search (`MANAGE-002`) is added to this search, screen and API before that clause ships.

## MANAGE-002

Folders, tags and custom envelope fields

Envelopes go into shared folders (shared with people, and with groups once `ADMIN-002` ships, to view or to edit under `ADMIN-001`'s sharing rules, which these shares meet before they ship), carry tags and custom fields (for example deal ID or cost center) that are searchable, reportable and sent to integrations.
A folder can carry its own retention rule, which takes the place of the account rule for the envelopes in it under `RECORD-005`'s semantics (warning, purge, legal hold), before folders ship.
Folders are managed by their creator, an owner or an admin; recipients of edit shares edit envelopes but cannot reshare or move them.
Only an owner or admin sets or clears a folder retention rule.
Moving a record requires its original sender or an owner or admin, and management authority over the destination folder.
Folder shares participate in reads, search, atomic edits and deferred releases; narrowing or removing them permanently suspends affected sender API keys.
Folder configuration, shares and their change receipts are installation state and are not restored from document archives; recorded folder IDs grant no access or automatic folder retention in a restored installation.
This conservative placement and restore default is pending ct approval.
Tags and required custom fields are retained with the envelope and its authenticated preparation or update events, copied and carried into templates; required values are enforced on preparation and draft edits.
Combined templates retain required metadata, with conflicting defaults requiring a value; a public form can be published only after required metadata defaults are set.
Folder rules replace account years, including when no account rule exists, and reuse RECORD-005 warnings, legal holds and erasure fences.
Groups inherit these rules under ADMIN-002; INTEG-001 must carry custom envelope fields through its HubSpot door before shipping.

## MANAGE-003

Waiting for me

Team members who must sign or approve envelopes from colleagues see them in a waiting-for-me list and sign inside the app without an email round trip.
Any member, whatever their role, signs their own turn this way, and owners and admins also find the prepared envelopes awaiting their approval there, and every named internal approver (`ROUTE-004`) finds the drafts waiting for their decision.
The member's signed-in session replaces the emailed or sender-provided code: opening their turn issues a fresh signing link, already verified in that browser for 24 hours, that replaces the link they were sent, and the record and certificate name the member whose session authenticated the signature.
A sender-set access code is still asked for (`IDV-003`).

## MANAGE-004

Reports and exports

Reports show envelopes sent, completed, declined and expired, time to complete, and per sender and per template turnaround over a date range, with CSV export.
A range is whole days in the account's US time zone (America/New_York until `ADMIN-004` lets the owner choose), both days included, at most 731 days.
Sent counts approvals in the range; completed and declined count those outcomes in the range, a withdrawal of consent counting as declined (`SIGNX-005`); expired counts sent, unfinished envelopes whose expiry passed in the range.
Time to complete runs from approval to completion, in hours, over the envelopes completed in the range: the median (the mean of the middle two for an even count) and the mean, each rounded to 0.1 hour.
Rows group by the member who prepared the envelope; a sender reports only on their own envelopes (`ACCESS-001`), and imported records are not counted.
The CSV holds one row per sender, an all-senders row and one row per template with the same numbers, and a cell that would start with =, +, - or @ starts with an apostrophe instead.
Template rows group the saved template ID across versions, use the title of the most recent included send, and exclude ad hoc envelopes.
CSV template rows use the template ID and title columns with blank sender cells; sender and total rows leave the template cells blank.

## MANAGE-005

Envelope detail and timeline

Each envelope has a detail page showing its documents, every recipient's place in routing and timeline (sent, delivered, viewed, authenticated, signed, declined or bounced, with times in the account's US time zone and UTC), what each recipient is waiting on, and the actions available to the viewer (remind, resend, correct, void, copy, download), next to the audit trail.
Exact semantics: the account's US time zone is America/New_York until `ADMIN-004` lets the owner choose another, and each time shows as, for example, "Oct 19, 2026, 10:02 AM EDT · 14:02 UTC".
Sent is when the provider accepted the invitation (or, with mail not set up, when the owner created the private link); delivered and bounced are the provider's event times for that invitation (`DELIV-001`); viewed is the first time the recipient opened the unsigned document after verifying and agreeing to electronic records; authenticated is their first verification (emailed code, sender-provided code or signed-in session); signed and declined are the signer record's times.
A step with no recorded fact is not shown.
Waiting on names the sender's approval or the scheduled send, the earlier routing order and who in it, the recipient's verification, their agreement to electronic records, their signature, or the sender's review of a paper scan.
Remind is offered to whoever may change the envelope (`ADMIN-001`) while it is open for signing with mail set up; it sends one reminder now to each recipient whose turn it is (never to one waiting for an earlier order or whose paper scan awaits review), recorded as a reminder so the automatic schedule (`DELIV-003`) counts from it.
Resend (`DELIV-005`), correct (`DELIV-006`), void, copy and download are today's other actions, and the documents list grows with `PREP-002`; a recipient's timeline also shows each correction of their place (added, corrected with what changed, removed).

## RECORD-002

Per-recipient certificate evidence

The certificate of completion lists for every recipient their authentication method and result, IP address, user agent, adopted signature and method, disclosure acceptance, and every timestamp in UTC and the account's US time zone, plus every document's fingerprint.
The IP address is the connecting address Cloudflare reports for the request and reads "not recorded" when there is none; the account's US time zone is America/New_York until `ADMIN-004` lets the owner choose another; the result of a code check includes how many incorrect codes are on record.
It is done when every method that exists today conforms (emailed code, sender-provided code, a member's signed-in session under `MANAGE-003`, access codes, typed and paper signatures), and `IDV-002`, `IDV-004`, `IDV-005`, `SIGNX-002` and `PREP-011` add their own method, result and adoption lines before they ship.

## RECORD-003

Sealed PDFs

The executed PDF carries a PDF digital signature (PAdES) from the installation's signing certificate or a certificate on the Adobe Approved Trust List obtained through a provider, so Adobe Acrobat shows the document as unmodified and any change breaks the seal.

## RECORD-004

Public verification

Anyone with an executed PDF or certificate uploads it to the installation's verification page and learns whether it matches a completed envelope, without signing in and without revealing other envelopes.

## RECORD-005

Retention and legal hold

Account and folder rules purge completed envelopes after a set number of years with notice to admins, and a legal hold stops purge and erasure for named envelopes.
Exact semantics: the account rule is one whole number of years from 1 to 99, set or cleared by an owner or admin (`ADMIN-004`'s retention default), kept with who set it and when.
It applies to every envelope that has ended: completed (at its completion), declined (at the decline or withdrawal of consent), voided (at the void) or expired (at its expiry, once that has passed without everyone signing); an envelope still open for signing is never purged.
Imported records fall under the rule too: an imported envelope from its recorded terminal instant (the source's completion, decline or void time; where the source gave none, the import time, labeled "terminal time not in the source"), and a DocuSeal move-in archive when its latest envelope is due, with the owner's undo through the import door kept.
An archive means all records sharing an uploaded source JSON (including overlapping imports); its due date is the latest terminal instant among those records plus the rule.
A hold on any record keeps the connected archive and its shared source JSON; owner/admin hold and lift are audited, owner erase and import undo refuse while it is held, and an overdue lift restarts the warning.
Existing DocuSeal jobs are backfilled from their recorded completion times without changing canonical imported values.
Each future importer (`MOVE-002`, `MOVE-003`, `MOVE-004`, `MOVE-005`, `MOVE-006`, `MOVE-008`) must preserve a source terminal instant or durably record its import instant and the missing-source-time label before shipping.
An envelope falls due at the instant it ended plus that many calendar years in UTC (a 29 February end falls due on 1 March); a warning stands only while that due date does, so an expired envelope the sender extends is no longer due.
The hourly pass warns every active owner and admin once, in their activity feed (`DELIV-008`) and by email, naming the envelope, the rule and the purge date, 30 days before the envelope falls due, or at once when the rule is set or shortened past that point; it purges at the later of the due date and 30 days after that warning, and never without one.
A purge is the owner's erasure: documents, audit events, recipients, messages and their provider delivery events, codes, copy links, shares, activity-feed notices and command results go, with Base's erasure record so restoring an earlier archive is refused naming the erasure; the retention ledger, which owners and admins read, keeps only the envelope ID, how it ended, the rule and the ended, warned and purged times.
An owner or admin places a legal hold on a named envelope with a reason (3 to 500 characters) and lifts it; both are recorded in the envelope's audit trail.
While an envelope is held the pass neither warns nor purges it and an erase request is refused naming the hold; lifting the hold restarts the 30-day warning.
Folder rules arrive with `MANAGE-002`'s folders, which carry them (a folder's rule in place of the account rule for its envelopes, under these semantics) in their own text and acceptance before they ship.

## ADMIN-001

Roles and envelope sharing

Built-in roles are owner, admin, sender and viewer, and custom permission profiles refine them (`ADMIN-008`).
Senders prepare, send, correct, remind and void their own envelopes and those shared with them for editing, and see those shared with them or their groups; admins see and act on all; viewers only read.
Envelopes and folders can be shared with people and groups to view or to edit.
These roles are the matrix every request is checked against (`ACCESS-001`).
An envelope is shared today one member at a time, found by their email in this workspace, by its sender, an owner or an admin; sharing again changes the access and removing a share ends it at once; people it is shared with cannot share it on; a viewer-role member's edit share lets them read only, and applies if they become a sender; every grant and removal is an audited event on the envelope; shares are installation state, erased with the envelope and not carried in an archive.
Folder shares arrive with `MANAGE-002`'s folders and group shares with `ADMIN-002`'s groups, each following these rules.

## ADMIN-002

Members, groups and departures

Admins invite, deactivate and re-role members, manage groups, and transfer a departing member's envelopes and templates to someone else without breaking in-flight signing.
Groups join `TMPL-002`'s template and folder shares (to use or to edit) and `ADMIN-001`'s envelope and folder shares (to view or to edit, under its rules) when they ship.

## ADMIN-003

SSO and SCIM

Members sign in through SAML or OIDC single sign-on (Okta, Microsoft Entra ID, Google Workspace, Auth) and are provisioned and deprovisioned through SCIM 2.0; SSO can be required for everyone but the owner's recovery path.

## ADMIN-004

Account defaults and sending policies

Admins set default reminders, expiry, authentication methods (`IDV-001`), allowed signature adoption methods, branding, retention, the consumer disclosure, whether free-form signing is allowed (`PREP-011`) (account-wide, off by default, owner or admin only; its versions fence free-form sends as `PREP-011` states, and group or profile policies narrow it when they ship), whether recipients may reassign their signing (`ROUTE-006`, today chosen per envelope) and sending policies.
A sending policy names, for each send source (ad hoc by a person, template, bulk batch, web form, API key or OAuth client, each integration, scheduled), whether it may send without a per-envelope human approval, for which templates and for which groups or permission profiles (`ADMIN-008`), and whether an internal approval (`ROUTE-004`) is required first; policies can be account-wide or per group or profile (for example templates only for one group).
Policies are versioned, and every sent envelope records the policy and version that allowed it (`SEND-001`).
Send policies follow scope-review-65.
Sources are ad hoc by a person, template, bulk batch, web form, API key or OAuth client (including `MOVE-007` calls) and one per integration; a scheduled send is not a source, so when a send goes out is the per-source `deferredRelease` field, and a deferred send is judged by its origin's policy when it is confirmed and again when it is released.
One policy version holds its scope (account, group or profile), source, mode (`off`, `person` or `autonomous`), templates (all or a list), `requireInternalApproval`, `deferredRelease`, who set it, when, and an optional reason.
An ad hoc send is never `autonomous`; web-form and template sources are tied to a template; ad hoc, template and bulk sources start at `person` and every other source starts `off`.
Only an owner or admin sets a policy, and making a source autonomous or widening its templates needs a sign-in no older than 15 minutes.
Precedence narrows only: each send has a principal (the person sending, the bound member of a key, OAuth grant or integration, or the form owner), and the effective policy is the account policy combined with every group and profile policy that applies to that principal, where the most restrictive mode wins, template lists are intersected, an internal approval is required if any policy requires it and deferred release is refused if any policy refuses it, so a group never widens the account policy.
Every save is a new immutable version with before and after values (and an `ADMIN-005` entry), and every sent envelope records its source, the credential or form, the principal, each contributing policy with its version and a fingerprint of the effective policy.
When a policy turns off or changes before release, a send that is still allowed with no new requirement releases and records the current versions, a send that now needs an internal approval enters the `ROUTE-004` wait, and any other send becomes a held draft (unused signing links revoked, pending mail cancelled, the principal and every owner and admin notified) that is never released automatically, even if the policy is switched back on: only a current editor's fresh eligibility confirmation releases it; envelopes already sent are never recalled.
With a policy off at request time, API and integration sends are refused with 403 `send_policy_off` and no envelope is created (a draft with the prepare scope still works), the person-based sources (ad hoc, template, bulk) are refused in `off` mode and need the person's confirmation in `person` mode, and web forms follow `FORM-001`.
Every source, door or credential a later clause adds (`BULK-001`, `FORM-001`, `API-001`, `MOVE-007`, `INTEG-*`) reads its policy here before it ships.
Reminder and expiry defaults now ship through Settings and `account.envelope_defaults`: expiry is 1–365 whole 24-hour days from preparation (120 initially); automatic reminders start off and, when enabled, use 1–30 whole business days for the first and repeat interval, Monday to Friday in America/New_York from 09:00.
A new envelope or template inherits omitted values; an explicit envelope value or the saved template settings take precedence, and `reminders: null` explicitly disables reminders.
A saved template snapshots these choices, including reminders off; changing the account default never changes an existing envelope or template.
Copies keep the source reminder choice and use the current account expiry.
Account defaults are installation settings excluded from archives, while the choices copied into envelopes and templates travel with their records.
Default recipient authentication is initially email code; an owner/admin may choose email code or link only, with the existing IDV-001 warning.
A new draft recipient or template role inherits only when all authentication flags are omitted; explicit false selects email code, SMS/in-person choices take precedence, and unresolved identities continue to require email verification.
Saved draft/template roles, envelope-derived templates and combined templates keep their saved method.
Link-only drafts remain refused when email delivery is unavailable.
Allowed electronic signature adoption methods initially include typed, drawn and uploaded marks.
An owner/admin must leave at least one enabled.
New drafts and templates snapshot the allowed list.
Editing/copying an existing request and saving it as a template retain its list.
Each newly prepared template-derived or combined draft intersects the saved template list with the current account list; an empty intersection is refused, so an older template cannot widen the account.
Existing prepared/sent requests keep their saved methods.
Payloads cannot override that list.
Every electronic signer, including a witness or group member, and every initials mark is checked against the envelope list on the server; the list is included in the sending fingerprint and authenticated custody validation.
Later account changes do not change prepared or sent requests.
Conservative consumer-disclosure default adopted pending ct approval: a signed-in owner/admin may add up to 4,000 characters beside the unchanged built-in disclosure, never replace its paper-copy, withdrawal, contact or technical requirements.
New drafts and templates snapshot this addition with the account-default version, actor and time.
Edits, copies and template use/composition preserve it; legacy requests retain the built-in disclosure alone.
Every current signer/action/document/supplement/progress/identity door requires agreement to that combined version.
The exact addition and accepted version/fingerprint travel with the record and certificate, and restore validates the saved addition against its definition.
Each explicit default save appends before/after values with actor/time at `/api/inkwell/envelope-defaults/history` (owner/admin only); ADMIN-005 must adopt that history with its restore merge hook before claiming the account log complete.
Recipient reassignment is initially off.
New drafts and templates inherit the account choice only when no explicit `allowReassignment` value is supplied; false explicitly disables it.
Saved drafts, saved templates (including older templates with it off), template composition, templates made from envelopes and copies retain their recorded choice when the account default changes.
An owner or admin saves defaults with the current version; stale writes are refused.
Every explicit send-policy save, including unchanged settings with or without a reason, creates an immutable version and an atomic command receipt; retrying the same command returns its original result without another version or reapplying settings after an intervening save.
Follow-up defaults inherit AGENT-003’s contact settings and still require an explicit person’s per-envelope grant before shipping.
Settings now edits each source's all/selected template list and optional review reason through the same versioned command, with keyboard controls and persisted choices; an enabled web-form policy requires a nonempty selected list.
Template-derived sends also obey SEND-001's live-revision confirmation rule above.

## ADMIN-005

Account audit log

Every change to members, roles, groups, settings (including the free-form signing setting, `PREP-011`, whose append-only change records this log adopts), templates, brands, integrations and API keys is recorded with actor, time and before and after values, searchable and exportable to CSV.
Scope-review-65 B11: the log also records every key, OAuth, form, webhook and send-policy change (`ADMIN-004`, `API-001`, `FORM-001`, `API-002`), with no secrets; the per-source send-policy versions (before and after values, actor, time, reason) that exist before this log ships appear in it as they do for the free-form setting.
Follow-up grant, version, revoke, suspend, send, reply-received, routed and resumed events inherit AGENT-003’s opaque-identifier, no-reply-text audit boundary before shipping.

## ADMIN-006

Transparent usage and cost

There are no envelope quotas or seat fees from Inkwell; the account shows envelopes sent and provider usage that costs the buyer money (SMS, identity checks, storage, AI) in USD with optional monthly caps that warn and then stop the paid feature.
Implemented conservative controls: only a signed-in owner or admin can view account usage or save a cap, with explicit consent and append-only before and after history.
Months use UTC; 80% warns and the next SMS attempt is refused if its approved allowance would exceed the cap.
Concurrent dispatches reserve atomically.
Every SMS door (codes, resends and follow-up) shares the allowance; all queued SMS work is cancelled rather than released later automatically, with the cap reason visible in message history.
Settings retains 80% and 100% threshold notices with the committed amount and cap, including reservations while the provider is still responding, and exposes the append-only setting history with actor, time and before and after amounts.
Each threshold also creates one private Activity notice for each active owner or admin; its action opens Usage and cost in Settings directly.
Members without a current administrative role cannot read these notices.
Each network attempt keeps the greater of its allowance and a provider-reported charge, including uncertain outcomes; missing or non-USD prices are shown as unpriced, never free.
No recipient is switched to email automatically: existing email recipients continue independently.
Inkwell counts native envelopes at actual release, excluding scheduled approvals until release, without envelope quotas.
Identity checks and AI have no connected paid provider yet; IDV-004, IDV-005, PREP-006 and AGENT-008 inherit usage and cap controls before adding one.
Storage and email billing and final SMS invoice reconciliation remain gaps, not zero-cost claims.

## ADMIN-007

First-day setup and readiness

On the buyer's own Cloudflare account, the owner claims the installation and a setup checklist covers the app domain, the sending domain's SPF, DKIM and DMARC records (checked live, showing any record to add), the mail and SMS provider connections with a test message (including adding Amazon SES, Postmark or SMTP sending, each reporting `DELIV-001`'s per-message status before it ships), the identity, payment and AI provider checks the account uses, the brand (`SIGNX-006`) and the consumer disclosure (`SIGNX-005`).
A readiness screen shows every check as passing or failing, and the first real send is refused until mail is ready, unless the owner records an explicit override.
Other inbound reply providers inherit AGENT-003’s signed, fresh, replay-protected message fetch, current reply capability, sender checking and reply-custody rules before shipping.

## ADMIN-008

Custom permission profiles

Beyond the four built-in roles, admins build permission profiles from named permissions (send ad hoc, send from templates only, bulk send, create and edit templates, manage web forms, correct, void, view every envelope of a group, manage brands, use API keys) and assign them to members or groups; sending policies can apply per profile (`ADMIN-004`), and every authorization check uses the member's effective permissions (`ACCESS-001`).
Scope-review-65 gives two permissions their meanings: "use API keys" lets a sender mint keys bound only to themselves, with scopes no wider than their own permissions (`API-001`), and "manage web forms" makes the member the owner and principal of the forms they publish (`FORM-001`).
A signed-in owner/admin may grant the current member-level “use API keys” permission through /api/inkwell/api-key-permissions, off when absent, only to an active sender.
The grant is versioned with immutable before/after values; a sender may list/manage only self-bound keys and mint only shipped scopes allowed by the current sender role and live record access.
Minting, re-scoping and rotation still require a sign-in no older than 15 minutes; the permission version and live role fence the transaction.
Losing the grant permanently suspends every bound key; restoring it never revives them.
Permission grants and local history are installation state excluded from document archives.
Future ADMIN-008 profile permissions must further narrow this gate and permanently suspend keys on authority loss before they ship.
Full custom permission profiles and their audit remain unbuilt.

## ADMIN-009

Two-factor sign-in for members

Members who do not sign in through SSO can add a second factor (a passkey or an authenticator app's time-based code, with one-time recovery codes), and the owner can require two-factor sign-in for every non-SSO member; the sign-in method and factor are recorded on the session, in the account audit log and on the certificate of anything the member signs in the app (`ROUTE-009`).

## API-001

Public REST API

A documented OpenAPI REST API with scoped API keys and OAuth 2.0 lets an application create envelopes from templates or files, set recipients, fields and prefill, send, read status, download artifacts, correct, resend, void and list, with idempotency keys and rate limits.
A call with the send scope sends immediately under the account's sending policy for API sends, with no per-envelope human approval, and the record names the key or client and the policy (`SEND-001`, `ADMIN-004`).
Credentials and policy follow scope-review-65 B1–B8 and A9.
Preparation agent tokens, API keys and OAuth grants are separate types: a preparation token is never upgraded to send, and every send, form, key, webhook and policy route refuses it with 403.
An owner or admin mints a key bound to any active owner, admin or sender; a sender with the `ADMIN-008` "use API keys" permission mints keys bound only to themselves, with scopes no wider than their own permissions; minting, re-scoping and rotating need a sign-in no older than 15 minutes.
A key is `iwk_live_` or `iwk_test_`, then its key ID and a 256-bit secret; only its SHA-256 hash is stored, with the prefix and last four characters for display; it is shown once and accepted only in the Bearer header; expiry is required (365 days by default, 730 at most, warnings at 30 and 7 days); rotation mints a successor with the same binding and scopes, and the old key stays valid for at most 7 days.
Scopes are `envelopes:read`, `artifacts:read`, `templates:read`, `envelopes:prepare`, `envelopes:send`, `envelopes:manage` and `webhooks:manage`, and send is never implied by another scope; a request may do what the key's scopes allow, limited by the bound member's current role, profile and shares and by the effective API send policy (`ADMIN-004`).
A key is bound to one member and that member's record version and is suspended permanently if the member is deactivated, removed, made a viewer, loses "use API keys" or is otherwise narrowed; it is never transferred and does not return when the role is restored, and deferred sends it authorised are held.
Revocation has zero latency: nothing is cached, so the first request after a revoke or suspension commits is refused.
Limits are 600 requests and 60 sends a minute per key and 3,000 policy sends an hour per account across API, integration and web form, over which a request gets 429 with `Retry-After` and nothing is queued; idempotency keys are kept for 24 hours.
OAuth is the authorization-code flow with PKCE, the consenting member is the bound member, access tokens last 1 hour, refresh tokens can be revoked, and the same suspension and policy rules apply.
With the API send policy off, a send call is refused with 403 `send_policy_off` and creates no envelope, while a draft with the prepare scope still works.
Current client doors: a fresh owner/admin session mints a live key bound to an active owner/admin/sender, with a once-visible 256-bit secret, SHA-256-only custody, safe metadata, 365-day default and 730-day maximum expiry, fresh-session re-scoping and rotation with at most seven days of overlap, and immediate revocation.
Rotation keeps the original binding, scopes and final expiry.
Member version/status/role loss and narrowed or removed sender record shares permanently suspend keys, even if authority is restored before the next call.
Keys stay out of installation archives.
Public /api/v1 envelope, artifact and template reads require separate scopes and the bound member’s current access; a prepare scope creates unsigned drafts with per-key command receipts even while API send policy is off.
A prepare-scope sent-status request is refused with no envelope created.
An explicit send-scope key under an autonomous effective API policy can atomically create and send from a file or a visible pinned template, with caller-reported prefill; its key/current policy and live member authority are recorded and fenced.
Template use access and definition are fenced in that same creation batch.
Bearer credentials never borrow a member session for session-only API routes; preparation tokens are refused at the key/client doors.
GET /api/v1/openapi.json describes these shipped client operations.
Single-envelope reads use the dashboard’s live expiry, and successful key requests count as authenticated access by the bound member under COMPLY-002; refused calls do not advance access, and credentials and content remain out of logs.
Remaining gaps: OAuth with PKCE and its consent screen, webhook-management scope, and the ADMIN-005 account audit log.
Test-mode keys and SDK coverage are evidenced under API-004.
The hourly pass sends one durable 30-day and 7-day expiry warning to the currently bound active member, with key name/prefix/last-four/expiry only; listing shows normalized sent/rejected/uncertain outcomes.
A claimed warning is never blindly replayed; an interrupted claim becomes uncertain after 10 minutes.
These paths continue to honor the existing separate credential types and person-only member-session controls.
A signed-in owner/admin may grant the current member-level “use API keys” permission through /api/inkwell/api-key-permissions, off when absent, only to an active sender.
The grant is versioned with immutable before/after values; a sender may list/manage only self-bound keys and mint only shipped scopes allowed by the current sender role and live record access.
Minting, re-scoping and rotation still require a sign-in no older than 15 minutes; the permission version and live role fence the transaction.
Losing the grant permanently suspends every bound key; restoring it never revives them.
Permission grants and local history are installation state excluded from document archives.
Future ADMIN-008 profile permissions must further narrow this gate and permanently suspend keys on authority loss before they ship.
Full custom permission profiles and their audit remain unbuilt.
The published OpenAPI document now describes custom envelope fields, inherited tags and folder, custom-field and tag filters, with the current 100-recipient bound.

## API-002

Signed webhooks with retries

Webhooks report sent, delivered, viewed, signed, declined, completed, voided, expired, bounced and reminder events, signed with HMAC SHA-256, retried with backoff for 72 hours, logged with every attempt, and replayable; each event has an ID so receivers can deduplicate.
Webhook endpoints follow scope-review-65 B10: each has an HMAC secret, shown once and stored encrypted; rotation keeps the old and new secrets valid for 24 hours; only HTTPS endpoints are allowed and private, loopback and link-local addresses are refused; payloads carry IDs and statuses only, never documents.
API-004 inheritance: production webhook delivery excludes test-mode records before its first door ships.

## API-003

Embedded signing and sending

An application embeds signing through a recipient view URL or web component in an iframe, receives postMessage events for signed, declined and closed, and embeds preparing and sending in its own pages, restricted to allowed origins.
**CT policy ruling, 26 October 2026: APPROVED WITH RIDERS.** This approves product defaults only.
Implementation, provider operation, legal suitability and release acceptance require separate evidence.
At the reviewed pin the clause remained partial; subsequent implementation evidence is recorded in Status.
**Origin authority and consent.** Embedding starts denied.
Only a signed-in owner or admin may grant, change or revoke an embedding origin and explicitly authorize a launch.
Granting or widening an origin and authorizing preparation require a native sign-in no older than 15 minutes.
Consent records the actor, time, consent-text version, exact parent origin, purpose, applicable grant version and launch expiry.
Launch consent identifies the envelope and recipient for signing, or the single draft allocation for preparation.
It discloses that the parent receives only the permitted status events.
It authorizes neither signing on another person’s behalf nor automatic sending, additional envelopes, document disclosure to the parent or wider API authority.
Recipient disclosure and consent to sign remain separate.
**Exact origins.** Production grants accept HTTPS origins only.
Matching uses the parsed, canonical origin tuple: scheme, canonical host and effective port.
Host case and an explicitly written default HTTPS port do not create distinct origins.
Subdomains, other ports and other schemes do not match.
Wildcards, opaque or null origins, credentials, paths other than the root, queries and fragments are refused.
An origin change revokes the old grant version and its outstanding launches and embedded sessions; the replacement requires explicit consent.
Removal and later re-addition never revive old authority.
**Launch and session custody.** A launch credential expires 15 minutes after issuance and is redeemable once, atomically, for one embedded session.
Replaying it creates no session, draft or invitation.
A failed response after successful redemption does not make the credential reusable; recovery requires a fresh authorized launch.
The session expires no later than the launch’s original expiry or an earlier underlying authority expiry.
It is bound to the installation, exact parent origin, purpose and grant version, and to the envelope and recipient identity epoch for signing or the authorizing member and one allocated envelope for preparation.
The native session is sealed on the server and is never disclosed to the parent.
Launch credentials are not persisted in browser storage and are removed from the visible launch location after redemption.
Responses prevent caching and referrer disclosure of credentials.
Secure, HttpOnly, partitioned cookies remain scoped to the embedded launch.
If supported browser custody cannot be established, embedding refuses with an actionable native continuation; it never exposes the session as a fallback.
Every embedded request, including reads, checks current origin authorization, launch and session validity, purpose, envelope scope and underlying authority.
Every mutation fences the relevant authority and record versions in the same atomic operation.
Revocation, closure, expiry, recipient replacement, applicable authority loss or erasure refuses the next request.
Restoring a role, invitation or origin does not revive revoked authority.
Preparation may access only its one idempotently allocated envelope and may not browse unrelated envelopes, change account settings, mint credentials or read archives.
**Framing and events.** Ordinary application and administration pages refuse foreign framing.
Only designated embedded pages allow framing by the authorized exact origin, with every ancestor constrained by the frame policy.
Embedded writes retain native request-integrity controls and cannot rely solely on browser framing restrictions.
The child posts only to the authorized exact target origin.
The parent verifies both the event origin and the source window.
There is no parent command channel.
Parent payloads contain only a type of signed, declined, closed or sent; only sent additionally contains the envelope ID.
They contain no recipient identifiers, names, email addresses, document content, field values, comments, artifacts, download links, credentials or error details.
These browser events are advisory status signals, not authenticated completion receipts or substitutes for API-002 webhooks.
**Preparation and sending.** Preparation creates or resumes one envelope idempotently and sends no invitation merely by opening, saving, retrying or closing.
Sending requires the ordinary human review and explicit eligibility confirmation inside Inkwell.
Sending retains current editor authority, sending-policy, template, internal-approval and deferred-release checks.
Signing retains the recipient invitation, verification, routing, disclosure, document audiences and selected signing profile.
The parent cannot approve or sign through a message.
**Custody, audit and erasure.** Origin grants, active sessions, launch credentials, sealed session material and replay or rate-limit state are installation state excluded from document exports and whole-installation archives.
Restore enables no embedding authority.
Non-secret envelope provenance and audit references remain with the business record.
Audit records grant changes and consent, launch authorization and redemption, closure, revocation, expiry and refused authority or limit outcomes, with actor or opaque subject, UTC time, exact origin, purpose, safe grant and launch references, applicable versions, envelope reference, outcome and before and after grant values.
Audit and diagnostic records contain no launch secret, cookie, session material, document text or field value.
ADMIN-005 inherits unified account-audit integration without changing this clause’s own evidence requirement.
Envelope erasure revokes and removes associated active embedding custody and identifying command results under ERASE-001, retains only the permitted erasure fence, and prevents an older archive from restoring that custody.
Retention and legal holds continue to govern whether the envelope may be erased.
Revoking an origin alone does not erase a signed business record.
**Limits.** Launch issuance permits at most 60 attempts per authorizing member and 300 per installation in a rolling minute.
Redemption permits at most 60 attempts per connecting address and 300 per installation in a rolling minute.
Embedded requests permit at most 600 per embedded session in a rolling minute.
Excess requests return 429 with Retry-After and cause no additional session, envelope or invitation and no silent queueing.
Existing verification limits and account-wide sending budgets also apply; a new launch cannot reset them.
These are product defaults, not legal requirements or envelope quotas.
The acceptance journey additionally proves every boundary and rider above, including declined and closed events, at 1440 and 390 for each changed screen.
API-001 retains any future scoped external launch-credential door before it ships.
The complete API, SDK, webhook, template, bulk, branding and integration targets remain unchanged.

## API-004

SDKs and test mode

JavaScript/TypeScript and Python SDKs cover the API, and a test mode creates watermarked, non-binding envelopes that never count toward usage or reach production integrations.
“API-004: JavaScript, TypeScript and Python examples run against a test key through the HTTP API” executes all three SDKs and independently reads back send, correction, resend audit and void effects.
API-002 retains production webhook exclusion in both documents before its future door ships.

## INTEG-001

HubSpot

Send from a HubSpot deal or contact with prefilled templates; status, key fields and the completed PDF return to the record and its timeline.
HubSpot contacts sync into the contact book (`ROUTE-008`).
Before this ships, native CRM record merging prefills PREP-008’s fields with their source and honors read-only values.
CRM owner defaults for follow-up inherit AGENT-003’s eligible escalation owner and explicit per-envelope grant before shipping.

## INTEG-002

Salesforce

Send from a Salesforce Opportunity, Account or Contact with merge fields; status and fields write back and the completed PDF attaches to the record's Files.
Salesforce contacts sync into the contact book (`ROUTE-008`).
Before this ships, native CRM record merging prefills PREP-008’s fields with their source and honors read-only values.
CRM owner defaults for follow-up inherit AGENT-003’s eligible escalation owner and explicit per-envelope grant before shipping.

## INTEG-003

Orbit

The same send, prefill and write-back for Orbit deals and contacts through Orbit's API.
Orbit contacts sync into the contact book (`ROUTE-008`).
Before this ships, native CRM record merging prefills PREP-008’s fields with their source and honors read-only values.
CRM owner defaults for follow-up inherit AGENT-003’s eligible escalation owner and explicit per-envelope grant before shipping.

## INTEG-004

Google Workspace

Pick sources from Google Drive and Google Docs (a Google Doc is exported to PDF and converted and fingerprinted as in `PREP-001`), file completed envelopes to a chosen Drive folder per template, and use the Gmail add-on: from an open message with an attachment, see the attachment and the message's participants (sender, To and Cc) proposed as recipients, then send it for signature or sign it yourself (`ROUTE-009`).
Connected Gmail reply sources inherit AGENT-003’s grant, authenticated reply intake, contact rules, reply visibility, logging and envelope custody before shipping.
Implementation semantics: native owner and admin sessions import selected Drive PDFs, exported Google Docs and current-message Gmail attachments without sending.
The contextual Apps Script add-on opens the native preparation door with a message reference and a send or self-sign choice; native review, field placement, eligibility confirmation and recipient authentication remain required.
Per-template Drive filing uses explicit administrative consent, verified completed bytes and manual recovery from uncertain uploads.
Configured Gmail reply intake verifies Google OIDC caller identity, the exact audience, subscription and mailbox, a fresh push and replay receipts, fetches Gmail history and messages at the network edge, and reuses AGENT-003’s current invitation capability, exact sender, grant, contact, private reply, logging, archive, hold and erasure gates.
Only recipient-address metadata is fetched before a current reply capability is resolved; message bodies, other headers and attachments are fetched afterward.
Credentials, push receipts and the mailbox-bound history cursor are installation state excluded from business archives; restore creates no active reply capability.
Provider tokens and Google add-on deployment are installation provisioning, separately from the acceptance fake.

## INTEG-005

Microsoft 365

Pick sources from OneDrive and SharePoint and file completed envelopes there; use the Outlook add-in, which from an open message with an attachment shows the attachment and the message's participants (sender, To and Cc) proposed as recipients, then sends it for signature or lets you sign it yourself (`ROUTE-009`); and use the Word add-in, which sends the open document (converted as in `PREP-001`) for signature.
Connected Outlook reply sources inherit AGENT-003’s grant, authenticated reply intake, contact rules, reply visibility, logging and envelope custody before shipping.
**Implemented Microsoft boundary.** The native Microsoft source door reads OneDrive and SharePoint PDFs, converts Word sources through Graph, and obtains Outlook attachment bytes and the sender, To and Cc participants from Graph.
Outlook and Word host harnesses supply the open resource context.
Preparation consumes an actor-bound staged source, refuses altered displayed bytes and records the converted PDF fingerprint.
A selected filing template must contain that exact PDF.
The Microsoft source policy starts off, and every send retains native human eligibility confirmation, current policy versions, internal approval and deferred-release fences.
SharePoint filing uses the existing explicitly consented per-template queue, deterministic filenames and remote byte verification; uncertain or conflicting copies stay visible until a manual retry.
Filing rules and credentials remain installation state; restoring business records starts no external transfer.
Remote copies remain outside local erasure.
**Conservative default adopted pending CT approval.** Only a signed-in owner or admin may read the installation's connected Microsoft drive or mailbox.
Source loading and reply intake require explicit native actions; no automatic mailbox subscription or outbound reply is enabled.
Recipient self-signing remains the member's own native session.
Explicit Outlook reply intake fetches Graph facts, requires a fresh current reply capability and authorized reply reader, refuses replays, and uses AGENT-003's existing grant, contact, pause, visibility, no-text audit, archive and erasure rules.
This default does not widen reply readers.
Signed Microsoft subscription notification intake and installed Office registration remain unproved.
INTEG-005 stays partial until CT approves the connection-authority default and the remaining gaps are proved.

## INTEG-006

Box and Dropbox

File completed envelopes automatically to a Box or Dropbox folder per template.
Implemented semantics: a signed-in owner or admin explicitly authorizes a template and existing provider folder in Settings.
Completion atomically queues the executed PDF and certificate; deterministic filenames and verified remote content prevent duplicate or overwritten files on retry, including a lost provider response.
Unconfirmed work stays visible until an explicit retry.
Disabling a rule cancels remaining work; a request already in flight may finish.
Provider credentials, filing rules and dispatch receipts remain installation state and do not restore into outbound activity.
The envelope audit preserves the authorization reference.
RECORD-005, PORT-001, ERASE-001 and COMPLY-002 retain their existing custody, erasure and logging boundaries; remote copies are not erased by local erasure.

## INTEG-007

Chest

Pick sources from Chest and file completed envelopes to a Chest folder.

## INTEG-008

Locket handoff

Locket starts signature for an approved contract revision, and the completed record (documents, certificate, parties, signing dates and fingerprints) is delivered to Locket's repository, which records it against that revision.
Objections routed to Locket inherit AGENT-003’s grant, pause, reply readers and envelope custody before shipping.

## INTEG-009

Zapier, Make, Power Automate, n8n and Crank

Published apps expose triggers (envelope sent, completed, declined, voided) and actions (send from template, find envelope, download), built on the API and webhooks.

## INTEG-010

Payment at signing through Stripe

A template can require a payment, deposit, saved card or ACH mandate when the signer signs, collected through the buyer’s Stripe account using Payment Element or Checkout.
The envelope completes only after Stripe confirms the required outcome.
Inkwell retains the immutable requirement, opaque Stripe references and normalized outcome, with ordinary authorization and consent audit evidence; it never handles card or bank data and holds no balances.
**CT policy ruling, 26 October 2026: APPROVED WITH RIDERS.** This approves interim product defaults only.
Implementation, provider operation, legal suitability and release acceptance require separate evidence.
This ruling makes no clause status change.
A signed-in owner or admin explicitly configures each template payment requirement.
Record the configuring actor, timestamp, requirement kind, amount and currency where applicable, buyer Stripe account reference and immutable requirement version.
Every configuration write rechecks current authority server-side.
Template use freezes the requirement on the envelope.
Later template edits do not change that frozen requirement or any signed evidence.
Stripe-hosted Checkout is the interim collection interface.
Only the assigned authenticated signer using the current authorized signing session may separately consent and start Checkout for their requirement.
A sender, administrator, agent or API credential cannot consent on that signer’s behalf.
Before starting Checkout, show the buyer, Stripe as provider, requirement kind, amount and currency where applicable, and an unchecked consent control.
For payment or deposit, use: “I agree to continue to Stripe Checkout to pay {amount} {currency} to {buyer} for this signing request.
Stripe collects my payment details directly.
Inkwell keeps the payment requirement, Stripe references, result and consent audit evidence.
My signature will not be saved until Stripe confirms successful payment.”

For a saved card, use: “I agree to continue to Stripe Checkout to save a card with {buyer} for this signing request.
Stripe collects my card details directly.
This step does not charge my card or authorize unspecified future charges.
Inkwell keeps the requirement, Stripe references, result and consent audit evidence.
My signature will not be saved until Stripe confirms successful setup.”

For an ACH mandate, use: “I agree to continue to Stripe Checkout to review and authorize the ACH mandate for {buyer} for the purpose shown here.
Stripe collects my bank details directly.
Establishing this mandate does not confirm a payment or authorize charges beyond the mandate’s disclosed terms.
Inkwell keeps the requirement, Stripe references, result and consent audit evidence.
My signature will not be saved until Stripe confirms successful setup and an active mandate.”

Identify the applicable provider terms and privacy notice before consent.
Stripe presents the applicable payment or mandate terms.
Record the signer, current invitation, requirement version, exact consent wording or immutable wording version, and timestamp.
Refusing consent starts no Checkout request and satisfies no payment requirement.
Payment consent is separate from electronic signature consent.
Payment and deposit require authenticated server confirmation that the PaymentIntent bound to this requirement succeeded for the required amount and currency in the buyer’s Stripe account.
Saved card requires authenticated server confirmation that the bound SetupIntent succeeded and its payment method is attached to the buyer’s Customer.
ACH mandate additionally requires an active applicable ACH mandate.
A successful setup is not a successful payment and grants no implicit charge authority.
Browser returns, Checkout completion alone, pending, processing, declined, canceled, unknown or mismatched results never satisfy the requirement.
Replayed evidence cannot satisfy another requirement or duplicate a completed action.
While the requirement is unsatisfied, the envelope remains waiting, the attempted signature remains unsaved and completion is denied.
Existing valid signatures remain intact.
Payment success does not replace any other signing, consent or routing condition.
Business custody contains only the immutable requirement, opaque Stripe references, normalized outcome and minimum configuration, consent and verification audit evidence.
No card or bank details, raw provider responses, usable Checkout capabilities or provider credentials enter business records, certificates, logs, traces, error reports or archives.
Inkwell holds no balances.
RECORD-005, PORT-001 and ERASE-001 govern this business evidence without creating a separate payment retention period.
Provider credentials and active Checkout authority remain installation-local and outside archives and copies.
Restore preserves historical references and outcomes as evidence but grants no active payment authority.
Unfinished restored requirements need fresh signer consent and newly established installation-local authority.
Copies preserve requirement definitions, reset payment outcomes and carry no active Checkout authority.
**Sandbox limits and named Gaps.** The interim proof uses Stripe test mode only.
It performs no implicit charges, refunds, recurring billing or production money operations.
Payment Element, refunds and disputes handling, receipts, tax, recurring billing handoff to Nectar, and live mode remain named Gaps.
Recurring billing belongs in Nectar or the buyer’s billing system.
These Gaps remain visible parts of the complete target and are not satisfied by this policy ruling.
No payment-processing, money-transmission or tax compliance is certified.

## INTEG-011

Signing service for sibling products

Platter, Lodge, Willow, Terrace and other Run Edit Run products send their documents through Inkwell's API and receive the completed record through webhooks, each with its own scoped key, sending under the account's sending policy for that key with no per-envelope human approval (`SEND-001`).

## MOBILE-001

Responsive sending and tracking

Senders send from templates, track status, remind, correct and void from a phone browser at 390 pixels, with the app installable as a PWA.
A phone browser here is a 390 by 844 pixel touch screen at 3x density; each of those screens (the Templates send form, the envelope list, the envelope detail page with its status, timeline, Remind, Correct and Void actions, and the correction screen) works there by touch without sideways scrolling.
Installable means the app's web manifest (`/manifest.webmanifest`, linked from every app page: the Inkwell name, standalone display, start at `/app`, 192 and 512 pixel icons) parses in the browser with no error and the browser reports nothing that stops installation; the installed app is the same web app and needs the network, with no offline mode.
Screens later clauses add to sending and tracking work at 390 pixels before they ship.

## MOBILE-002

Native iOS and Android apps

Native apps sign, send from templates, track and remind, receive push notifications, and scan paper pages with the camera into a PDF to send.

## MOVE-002

Docusign move-in

Through the Docusign eSignature REST API with the buyer's OAuth grant, Inkwell imports completed, declined and voided envelopes with their documents, certificates of completion, recipients and custom fields; templates with roles, fields, routing and their shared folders; signing groups with their members (`ROUTE-005`); and the account's address book (`ROUTE-008`).
Ownership carries over: Docusign users are matched to Inkwell members by email, each imported envelope belongs to its original sender and stays private to them under `ADMIN-001` (and shared as it was in Docusign), each template keeps its owner, and each shared folder keeps its people, groups and use or edit permissions (`TMPL-002`).
Users with no matching member go on the unmapped list and their items go to an admin the owner names, who can reassign them later (`ADMIN-002`).
Account objects import too: brands become Inkwell brands (`SIGNX-006`); the account's custom ESIGN consumer disclosure becomes the account disclosure as a new version (`SIGNX-005`); default reminder, expiry and recipient authentication settings become account defaults (`ADMIN-004`); saved bulk-send lists become saved lists for `BULK-001`; and each PowerForm becomes a web form (`FORM-001`) on its imported template, with its old PowerForm URL recorded beside the new link and listed on a cutover checklist so the owner can swap the link on their website.
The import previews first, with counts per sender and per object type, and lists what did not map, with each unmapped object's Docusign name and ID; it runs throttled and resumable at real account size (`MOVE-008`).
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## MOVE-003

Adobe Acrobat Sign move-in

Agreements with their audit reports and library templates import through the Acrobat Sign API with the same preview, unmapped list, ownership mapping by email as `MOVE-002`, and the throttled, resumable job of `MOVE-008`.
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## MOVE-004

Dropbox Sign move-in

Signature requests with their files and audit trails and templates import through the Dropbox Sign API, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`.
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## MOVE-005

Documenso move-in

Documents with their audit logs and templates import from Documenso's API or export, with the preview, unmapped list and ownership mapping of `MOVE-002` and the job of `MOVE-008`.
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## MOVE-006

Cutover of in-flight envelopes

Envelopes still waiting in the incumbent at cutover are listed under their mapped sender and tracked read-only until they complete there, then imported automatically; nothing is re-sent to signers.
Tracking uses the incumbent's completion webhooks (Docusign Connect) where the grant allows and otherwise polls no more often than the incumbent permits (`MOVE-008`).
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## MOVE-007

API compatibility for common calls

A compatibility layer accepts the most common Docusign and Dropbox Sign API calls (create from template, create and send in one call, status, download, void, and completion webhooks shaped as Docusign Connect messages and Dropbox Sign callbacks) so an existing integration switches by changing its base URL, key and webhook secret.
A create call with status sent sends straight away under the account's sending policy for API sends (`SEND-001`, `ADMIN-004`).

## MOVE-008

Throttled, resumable imports at account size

Every API import (`MOVE-002` to `MOVE-006`) runs as a background job sized for real accounts (tens of thousands of envelopes over many years).
It stays under the incumbent's published limits, reading the limit headers (for Docusign, the account's hourly limit, 3,000 calls by default, and the burst limit, and never polling one resource more than once every 15 minutes); on a rate-limit response (`HOURLY_APIINVOCATION_LIMIT_EXCEEDED`, HTTP 429) it pauses until the window resets.
It checkpoints after every batch, so an interruption, a restart or an expired grant resumes from the last checkpoint, and it is idempotent on the incumbent's envelope and template IDs, so a resumed or repeated import creates no duplicate.
The job shows progress, an estimated finish time, counts per state and the unmapped list, and the owner can pause or cancel it.
Before this door ships, imported envelopes preserve the source terminal instant or a durable import instant labeled “terminal time not in the source”, and meet `RECORD-005`’s warning, legal-hold, erasure and restore-fence rules.

## PORT-002

Self-service export at any size

Admins export all or selected envelopes as PDFs, certificates, audit JSON and a CSV index, streamed in chunks without the 24 MiB browser limit, and a whole-installation archive restores at that size.
Exact semantics: native owner/admin sessions prepare a stable all-or-selected document snapshot and download a streamed TAR containing available original/executed PDFs, certificates, audit JSON, record-custody JSON, a CSV index and per-file SHA-256 manifest.
Imported archives retain owner-only custody access.
Custody JSON includes the SIGNX-009 transcript; ordinary audit JSON never includes its text.
Downloads accept one byte range with a stable snapshot ETag.
Erasure or retention purge invalidates snapshots containing the retired record.
The owner builds and restores whole-installation NDJSON archives through the pinned portability service with durable part cursors, repeat-safe uploads and bounded browser record parsing; the whole file is never loaded into browser memory.
An empty destination publishes only after every part, closing checksum, stored document fingerprint and erasure fence passes.
Existing small JSON wrappers retain their 24 MiB bound.

## COMPLY-001

21 CFR Part 11 signing profile

An optional profile for life-science buyers requires re-authentication at each signature, a signing reason, the signature manifestation (printed name, date and meaning) on the document, and a validation package: installation, operational and performance qualification (IQ, OQ and PQ) scripts with their executed results for the installed version, a traceability matrix from each Part 11 requirement (11.10, 11.50, 11.70, 11.100, 11.200 and 11.300) to the feature and test that meets it, and the change log since the last validated version.
Signing door (ct 22 Oct): each Part 11 signature requires two distinct components.
The first signature in a session uses a credential the signer alone holds (password, passkey or OIDC tied to a verified Inkwell identity) plus the fresh emailed code.
Later signatures in the same continuous session require at least the fresh code.
A recipient with no such identity is refused in this profile with 'Part 11 signing needs a verified signer account', never downgraded.
Meanings: Approval, Review, Responsibility, Authorship, plus owner-defined meanings recorded with their text.
An admin verifies a signer's identity, and records the method, before that signer's first Part 11 signature.
A locked-out or exhausted code notifies the owner/admin security contact within one minute and is listed.
The organization's FDA certification under 11.100(c) is recorded with its date and reference. 'Validated' means only this: IQ/OQ/PQ executed on the installed version, every matrix row (11.10(a)-(k), 11.30, 11.50, 11.70, 11.100, 11.200, 11.300) citing a test that passed in that run, and a change log since the last validated version.
Procedural controls (11.10(i), (j)) are the customer's and are listed in the matrix as theirs.
Implemented semantics: frozen owner/admin per-draft opt-in, with no removal through edits/copies/templates; paper signing refused; a fresh recipient/link/session-bound code at each signature (10 minutes, five attempts, 60-second spacing, ten requests per link); verified printed name and exact meaning in PDF/certificate and immutable signature evidence.
Independent password identity sessions grant no app access and last at most 24 hours; hosted termination revokes them.
Account identity/version, current status, credential session and code are fenced in the signing transaction.
Legacy signed records preserve their original proof and are never retroactively qualified.
Enrollment and recovery (ct 22 Oct, approved as implemented): an owner or admin other than the signer verifies the signer's identity and records the method; this issues a one-use activation token, valid for 24 hours, shown only to that verifier for separate trusted delivery and never emailed automatically.
Separate delivery is the verifier's responsibility.
The signed-in, verified account holder chooses a separate 15–128 character signer password, stored salted with PBKDF2-SHA256 at 600,000 iterations.
Recovery requires fresh admin reverification and a new activation token; reverification immediately revokes the old password, any unused token and every identity session.
Identity sessions last at most 24 hours.
The per-account password bucket counts all authentication attempts, including successful attempts, in fixed ten-minute windows aligned to Unix time.
An incorrect or exhausted attempt at count five or greater records a security alert and attempts mandatory email to active owner/admin security contacts; attempts after five are refused even with the correct password.
A correct fifth attempt succeeds.
These lifetimes, lengths, hash parameters, attempt/code limits and the one-minute alert target are Inkwell product choices, not numeric requirements set by 21 CFR Part 11.
Password aging and periodic credential review under 11.300(b) remain the customer's procedure.
Only the owner defines custom meanings.
Remaining: Customer-installed IQ/OQ/PQ execution and reviewed passing evidence for every matrix row, customer procedural controls, installed real-provider one-minute alert receipt, OIDC composition qualification and a reviewed change log from the last validated version remain unproved.
No qualification or certification is claimed.

## COMPLY-002

HIPAA-ready installation

Healthcare buyers can run Inkwell with logging that excludes document content, access reviews, and a documented shared-responsibility guide for their Cloudflare account; a business associate agreement is the buyer's arrangement with their providers.
The owner or admin enables the healthcare profile in Settings and reviews every member, including invited and inactive members, with their current role, status and last successful authenticated request (HTTP status below 400, stored in UTC, displayed in the reviewer's local time); no recorded access is explicit.
Tracking covers every current page, API, auth, import and archive door and continues with the profile off.
Newly issued member sessions count; anonymous recipient and preparation-agent sessions do not.
Operational request logs contain only a fixed event, fixed door category and status; provider receipt logs retain normalized delivery facts and fingerprints, excluding raw payloads.
Document content and field values are excluded from operational and provider logs while signed documents, field values and audit evidence are preserved.
This profile makes no certification or provider-verification claim; the shared-responsibility guide names provider agreements, logging configuration, access, retention and incident duties.
Existing capabilities conform; future doors, providers and record kinds added under PREP-006, API-001 through API-004, INTEG-001 through INTEG-011, IDV-002 through IDV-005 and AGENT-001 through AGENT-009 inherit this logging boundary before shipping.

## AGENT-001

Assemble the envelope from CRM and email context

*What the agent does:* from a request ("send the MSA to Acme") or a deal stage change, picks the approved template, fills roles and fields from the CRM record and the email thread with the customer, and proposes signers with their authority (title, entity).
*Data:* the CRM record (Orbit, HubSpot, Salesforce), the granted mailbox thread (Gmail, Outlook), templates and contacts.
*Human control:* the sender sees a draft envelope with each value's source and confidence and approves sending; the agent cannot send, and a value it could not source stays empty.

## AGENT-002

Fill what is missing

*What the agent does:* before sending, detects missing parties, fields, attachments and inconsistencies (an entity name that differs from the CRM, a missing signer title, a W-9 not attached) and asks the right person (sender, colleague or recipient) by email with one specific question, then merges the answer with its provenance.
*Data:* the draft envelope, CRM record and replies.
*Human control:* the sender approves who may be asked; changes to material terms are flagged for the sender and never applied by the agent.
Implemented native-door semantics and remaining Gap: Adopted conservative default pending CT: received W-9 PDFs are private source custody for current editors, never automatically signer-visible supplements.

## AGENT-003

Chase stalled signers under the sender's rules

*What the agent does:* watches each recipient's events (not opened, opened and left, bounced, out-of-office replies, repeated views), tells apart an unavailable signer, a bad address and a substantive objection, and follows up by allowed channels and times with a message suited to the cause; an objection goes to the sender (or Locket) instead of another reminder.
*Data:* delivery and signing events, replies in the granted mailbox, the CRM owner.
*Human control:* the sender sets channels, maximum contacts, quiet hours and the escalation owner; the agent never negotiates or changes the document.
Exact semantics (ct, 22 Oct): a follow-up grant is an explicit, versioned, per-envelope authorization for Inkwell's built-in agent, given by whoever may change the envelope (ADMIN-001).
It is never a credential, and no preparation token, API key or OAuth grant can create, use or read it.
It sets channels (email; SMS with IDV-002), at most 1-10 contacts per recipient (default 3, counting DELIV-003 reminders sent under it), allowed days and hours in the account's US zone, and an escalation owner who can read the envelope.
It authorizes only reading this envelope's delivery and signing events and its replies, sending fixed per-cause follow-ups with the current invitation link to current-turn recipients at most once per business day, and proposing actions to people.
It never corrects, voids, extends, edits, answers or signs.
Every action rechecks the grant, the bound member's authority, the envelope's open state and the recipient's turn and identity epoch in the same batch.
Revocation takes effect for the next action and cancels scheduled follow-ups; the bound member's loss of authority suspends it permanently; a claimed send is never resent.
Causes are deterministic ("model/provider: none"): DELIV-002 bounce = bad address; RFC 3834 auto-reply = unavailable until its explicit return date (else M business days); any other authenticated reply pauses follow-up to that recipient until a person resumes it and is routed to the sender and escalation owner; not-opened, opened-and-left and repeated-views get one follow-up each.
A corrected address is only a cited proposal applied through DELIV-002.
Replies arrive at a per-recipient, per-identity-epoch 256-bit Reply-To capability (purpose-separated HMAC of the random invitation identity; only its hash is stored; never archived; rotated on correction or reassignment; dead at close) through Resend's Svix-signed `email.received` webhook (5-minute window, replay refused) plus a fetch of the real message.
They are accepted only with signature, capability and an exact current-recipient From; a mismatched or provider-failed sender is kept as "unverified sender" and never acted on; an unknown capability stores nothing.
Text up to 500 kB and core headers are kept, larger bodies are labelled not kept, and attachments are listed by name, type, size and SHA-256 only.
Reply text is read only by the sender, the escalation owner and those who may change the envelope, never by keys, tokens or other agents.
It is absent from logs, audit and notifications, travels with export and archive, follows RECORD-005 holds, is erased by ERASE-001, and never appears on the certificate.
Any model classification first meets PREP-006's enablement and disclosure terms.
INTEG-004 and INTEG-005 (a connected Gmail or Outlook mailbox as a reply source), IDV-002 (SMS follow-up), INTEG-008 (objections routed to Locket), INTEG-001..003 (CRM owner as default escalation owner), ADMIN-004 and TMPL-001 (follow-up defaults), ADMIN-005 (grant events), ADMIN-007 (other inbound providers) and AGENT-009 (the account's inbound address) each carry these rules in their own text and acceptance before they ship.

## AGENT-004

Verify the intended revision and parties

*What the agent does:* before sending and at completion, compares the documents against the approved revision (Locket's approved version or the template version) page by page, checks every required party signed in the right capacity for the right entity, and checks every required field is complete and plausible.
*Data:* the envelope's fingerprints and documents, the approved revision, CRM signatory data.
*Human control:* a mismatch raises an exception the sender must resolve; the agent cannot alter a completed record.

## AGENT-005

Complete the downstream work

*What the agent does:* after a verified completion, moves the CRM deal stage, files the record to Locket and the file store, and creates the next task (customer onboarding, invoice draft in Nectar or Pantry, HR onboarding in Willow), each once, with a receipt per effect.
*Data:* the completed record and the standing grants.
*Human control:* standing grants name the systems, fields and task types; the agent never creates a charge or binds a contract; failed effects stay open and visible.

## AGENT-006

Keep integrations correct

*What the agent does:* reconciles webhook deliveries and connector state against Inkwell's records, detects drift (a renamed CRM field, a moved folder, an expired token), proposes the mapping repair and proves a replay causes no duplicate.
*Data:* webhook logs, connector configurations and the remote API state under grant.
*Human control:* the owner approves scope changes and repairs; uncertain remote effects stay unresolved until confirmed.

## AGENT-007

Keep templates current

*What the agent does:* learns from senders' repeated corrections (fields always added, recipients always changed) and outside changes (a new IRS W-9 revision, a new company address) and proposes a template revision with its reasons.
*Data:* envelopes sent from the template and their corrections.
*Human control:* the template owner reviews the diff and publishes a new version (`TMPL-003`); nothing changes without them.
The template maker opens suggestions on Templates.
Three distinct envelopes with the same correction establish repetition; a replacement PDF recorded in a corrected envelope is a source revision to review even on its own.
Fields, their placement and prepared values, role count and routing, and replacement PDF fingerprints are compared against the template version the envelope came from.
Names and emails supplied to fill a role are per-send inputs, not reusable role changes.
Suggestions cite each supporting envelope and its correction event hash and time and show the before and after definition and original PDF.
They use only envelopes the maker can already read under `ADMIN-001`; a recorded replacement or reported address is never labeled externally verified.
The maker explicitly reviews and publishes through the normal template validator, preserving other template settings and producing the next version (`TMPL-003`); reviewing alone changes nothing, a stale template or withdrawn source suggestion is refused, and repeated approval with one command ID publishes once.
The published template records the maker, time, proposal ID and supporting event references.

## AGENT-008

Signer assistant

*What the agent does:* answers a signer's questions about what they are being asked to fill and sign, citing the page and passage, and explains each field in plain English or Spanish.
*Data:* only the envelope's documents visible to that signer.
*Human control:* the assistant gives no legal advice, cannot fill or sign, and a signer's questions are private unless they choose to send them to the sender.

## AGENT-009

Inbound agreements

*What the agent does:* reads agreements forwarded to the account's Inkwell address or arriving from other platforms for the business to sign, identifies who internally should sign, prepares the internal signing and tracks the counterparty's request.
*Data:* the forwarded email and attachments.
*Human control:* the named internal signer approves and signs; the agent never signs and never replies to the counterparty without the owner's grant.
The account inbound address inherits AGENT-003’s signed, fresh, replay-protected reply intake, visibility, no-text logging and envelope retention rules before shipping.
Implemented native-door semantics and remaining Gap: Adopted conservative default pending CT: owner-maintained business-role mapping, exact approved forwarder, and a separate owner return action under the current grant.

## HubSpot contact sync

CT policy ruling, 27 October 2026, reviewed candidate 60480eb5a367d64b2e78d019a066451118fa2da2: APPROVE WITH RIDERS. Native owner or admin authorization for CRM reads and imports is approved as the current administrative door. A selected-record preparation requires explicit authorization. A contact import may be authorized once for the complete defined run rather than separately for each provider page. A recurring sync requires an explicitly enabled, versioned standing authorization identifying the HubSpot account, authorizing member, selected record scope or filters, imported properties, mappings, destination shared contact book, update behavior and cadence. The confirmation discloses that ROUTE-008 permits the account’s owners, admins and senders to read the imported contacts. Widening that definition requires fresh authorization.

Each run and continuation rechecks the current authorization, authorizing member and connector credential before reading and committing. Revocation or loss of the authorizing member’s authority stops further pages; restoration does not revive the authorization. Progress is bounded and resumable, with page and record counts, failures and remaining work visible. Provider record identity and durable progress prevent duplicate application after interruption. Conflicting local edits are reported for resolution, and absence from a provider page never silently deletes a local contact. The audit retains who authorized which version and scope, when it ran and its outcome without retaining provider credentials or imported field values in operational logs.

CRM authorization grants no envelope access, signing consent, sending authority or follow-up authority. Existing senders may use permitted synced contacts without becoming administrators. Native record merging continues to inherit PREP-008’s provenance, read-only and custody rules. CRM owner defaults continue to inherit AGENT-003’s eligible escalation owner and explicit per-envelope grant. INTEG-001 also carries MANAGE-002’s custom envelope fields through its HubSpot write-back door before shipping.

Integration sending inherits SEND-001 and ADMIN-004’s approved source policy, contributing policy versions, credential and principal recording, narrowing precedence, internal approval where required, atomic live release checks and held-draft recovery. A policy-off integration send is refused without creating an envelope. Ordinary human sending in the preparation slice does not discharge that obligation. Administrative CRM authorization is not a determination of lawful source-data use, marketing permission or an agreement’s legal validity. This ruling accepts no completion.

Rider acceptance: authorize one scoped import spanning multiple provider pages, interrupt and resume it, and reconcile the selected contacts without duplicates or a consent prompt for each page. Repeat an authorized sync and retain source identity and local-edit conflicts. Revoke the authorization and narrow the authorizing member between pages; the next continuation reads and writes nothing, and restoring the former authority does not resume it. Refuse unconsented and unauthorized preparation as well as sync. Prove that an ineligible CRM owner gains neither envelope access nor a follow-up grant. Retain the exact authorization scope and version in the audit. Restore prepared provenance without restoring connector authority. Exercise the connector’s own configuration, launch and progress screens at 1440 and 390 in the recorded exact-SHA landing run.

**Implementation boundary:** Live HubSpot provisioning and provider interoperability remain unproved separately from the required network-edge-fake acceptance. Administrative consent supplies no legal determination about source-data use or agreement validity. No original duty is carved away.
