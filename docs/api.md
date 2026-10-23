# API keys and envelope clients

The current API can read envelopes and artifacts, list templates, prepare unsigned PDF drafts, send under an autonomous API policy, correct, resend and void envelopes with a manage scope. Its machine-readable description is `GET /api/v1/openapi.json`. API-001 remains partial: OAuth/PKCE, API correction/resend routes and account-audit integration are not shipped. Test-mode keys and webhook management remain unavailable.

An owner or admin uses their normal signed-in session and same-origin JSON requests to manage keys. `POST /api/inkwell/api-keys` takes `commandId`, `name`, the bound `memberId`, `scopes`, and optionally `expiresInDays` (365 by default, 1–730 whole 24-hour days). The member must currently be an active owner, admin or sender. A sender's own minting requires an explicit owner/admin self-service permission grant; see below. Minting, scope changes and rotation require a sign-in from the last 15 minutes. Listing and revoking keys need a current owner/admin session. Bearer credentials cannot manage keys or use member-session commands, even alongside a valid browser cookie.

The successful mint response reveals the `iwk_live_` key ID and 256-bit secret once. Store it privately: retrying the same command returns the original metadata and `tokenShown: true`, without the token. Only a SHA-256 hash is stored, with the prefix and last four characters for identification. The list never reveals a secret or hash. Key credentials stay out of document archives and are never restored into another installation. Do not put tokens in URLs, query parameters or logs.

Clients send `Authorization: Bearer <key>` to `/api/v1/` routes, with no browser cookie. Each route requires its own scope:

| Scope | Routes |
| --- | --- |
| `envelopes:read` | `GET /api/v1/envelopes`, `GET /api/v1/envelopes/{id}` |
| `artifacts:read` | `GET /api/v1/envelopes/{id}/artifacts/{kind}` |
| `templates:read` | `GET /api/v1/templates` |
| `envelopes:prepare` | `POST /api/v1/envelopes` with draft status |
| `envelopes:send` | `POST /api/v1/envelopes` with sent status, `POST /api/v1/envelopes/{id}/send` |
| `envelopes:manage` | `POST /api/v1/envelopes/{id}/void` with a reason |

No scope implies another; send and manage must be granted explicitly. The member's current role and record shares still limit each request. A sender can find and read only their own envelopes and those shared with them. Missing or invalid keys receive 401; insufficient scopes and denied record access receive 403. Preparation-agent tokens receive 403 on these routes and cannot become API keys.

Preparation takes the PDF, recipients and fields described in the OpenAPI document, plus a `commandId`. It returns `{ "result": { "id": "..." } }` for an unsigned draft. For 24 hours, retrying the same command ID and input returns the same result, independently for each key; changed input with that ID receives 409. At or after 24 hours it is a new request. Mint/rotate receipts never expire and never reveal a secret again. API send policy being off does not prevent draft preparation. `status: "sent"` requires the explicit send scope and an autonomous effective API policy. Off/person/refused policy returns 403 before any envelope is inserted. Creation, sending authority, quota admission, signer credentials and invitations commit together. Required internal approvals put the new draft into the existing approval wait; a key never supplies an approver's personal decision. API keys cannot call the member-session approval command.

A send records the API source, bound principal, key ID/current version, every contributing policy version and the effective fingerprint. Every immediate release, scheduled dispatch and last internal approval fences current policy/membership, credential expiry/revocation/suspension/send scope, the bound member's current authority, the frozen definition, the free-form setting and pinned template revisions. No credential secret is recorded. Policy-off or revoked credentials hold deferred sends, revoke unused links and cancel pending invitations. Switching the policy back on never auto-releases the held draft. A current editor can explicitly assume personal sending authority by confirming the unchanged held draft under their current ad hoc/template policy; the earlier API authority remains in its audit trail. Sent envelopes are never recalled.

Rolling windows permit 600 authenticated requests per key per minute, 60 actual policy releases per key per minute, and 3,000 policy releases per account per hour. A full window returns 429 with a positive `Retry-After` in seconds; no envelope or invitation is created over budget. Retries of an existing receipt consume request admission but never another send admission. A scheduled release that reaches its send limit is held for explicit editor review, rather than silently queued for later. Request counters and policy-send counters are installation state excluded from archives. `tests/journeys/api-capacity.mjs` is the committed outside-Verify proof of all three limits on an exact candidate SHA.

Use `POST /api/inkwell/api-keys/{id}/scopes` with `commandId` and `scopes` to change a current key's scopes. The next request sees the change; this cannot change the bound member. `POST .../{id}/revoke` with `commandId` permanently revokes the key. The first request after revocation commits is refused, without a cache delay.

`POST .../{id}/rotate` takes `commandId` and optional `overlapDays` (7 by default, 0–7 whole days). The successor retains the member, scopes and original final expiry; the predecessor expires at the earlier of that expiry or the overlap deadline. Zero days retires it immediately. Each predecessor has at most one successor; change scopes on the successor. The successor secret is revealed once, with metadata-only retries just like minting. Revoke either key separately to terminate its remaining access.

A member's record-version change, deactivation, deletion or loss of sender authority permanently suspends their keys. Narrowing or removing a sender's envelope or template share does so too. Restoring the member or share never revives an old key; an owner/admin must issue a new one. Suspension happens when the member or share changes, even if no client request occurs during the loss. Draft writes also recheck key validity, required scope and member authority in the same atomic batch as the draft.

Single-envelope reads show expiry consistently with the dashboard. Successful key requests appear as the bound member’s authenticated access in the healthcare access review, including while the profile is off; refused calls do not advance it. Fixed-schema request logs contain no URL, token, document text or field values.


To create from a saved template, use `templateId`, one `recipients` entry per role,
and optional `prefill` keyed by field ID/name (`{value, source, readOnly?}`). The
source is reported by the caller. Supply a template or a file definition, not both.
The template's content, fields, expiry/reminders, disclosure/adoption choices and
approval rule are pinned. API policy is still the sending source; its template
allowlist applies. A changed live template holds deferred releases until a current
editor confirms the unchanged frozen request.

The hourly scheduler sends the bound active member one warning on entering the
30-day window and one on entering the 7-day window. A newly issued short-lived key
starts with its current window; it never claims a warning that happened in the
past. Messages contain the display name, prefix/last four and exact UTC expiry,
never the secret or hash. Key listings include the warning's sent/rejected/uncertain
outcome. A claimed attempt is never blindly replayed; a claim interrupted for over
10 minutes becomes uncertain, so an administrator can review it. Revoked,
suspended, expired and no-longer-bound credentials receive no new warnings.

`POST /api/v1/envelopes/{id}/correct` and `/resend` require
`envelopes:manage` and the bound member's current edit access. Corrections use
`signers`, `fields`, `subject`, `message` and/or `expiresAt`; omitted values stay.
A supplied signer list keeps every existing place, marking removals with
`remove: true`. A signed recipient and their fields are immutable. Changing an
unsigned recipient's identity rotates their link and revokes prior sessions.
Resend takes a zero-based `signer`, optional `newLink` and optional `channel`
(email by default, or SMS for an eligible individual with a saved mobile number).
It applies the same current-turn, bounce and paper-review rules as the dashboard.
Both take `commandId`, write a per-key 24-hour receipt in the same transaction,
and audit the real bound member. Retrying a receipt never sends another message.

An owner/admin may use `GET/POST /api/inkwell/api-key-permissions` with their
native session. A change takes `memberId`, `enabled`, `expectedVersion` (0 for
an absent grant) and `commandId`. Only an active sender can receive this grant.
Versions preserve actor, time, before and after values. Senders start without it.
With it, a sender may mint only self-bound keys with shipped role-supported
scopes, list only their own keys, and rotate, re-scope or revoke only those keys.
The same 15-minute sign-in rule and live record-access boundaries apply. Losing
this permission permanently suspends all bound keys, including owner-issued
keys; restoring the permission does not revive them. Grants/history do not travel
with document archives. This is the API-key permission foundation; full ADMIN-008
profiles must narrow these gates and suspension rules before they ship.


## Web-form admission foundation (FORM-001 remains partial)

These routes configure and verify admission only. There is no public form page or submission route yet; an admission token cannot create, send or sign an envelope. The total/daily submission limits are saved for the future submission transaction, not enforced by email verification. QR links, embed snippets, the signing/countersigning flow and policy-held review remain unbuilt.

Native owner/admin sessions may GET/POST `/api/inkwell/web-form-permissions` to inspect or version a sender’s explicit grant (`memberId`, `enabled`, `expectedVersion`, `commandId`). A sender needs this grant and live template access; it never grants record access. GET `/api/inkwell/forms` lists forms the current publisher manages. POST creates a new immutable form with `templateId`, `templateVersion`, `publicRole` (zero-based), `fixedRecipients` (null for that role, name/email for every other role), and `commandId`. Optional totalLimit/dailyLimit/expiryDays default to 100/50/90; totalLimit is at most 10,000 and expiryDays at most 365. Republish creates a new ID. POST `/api/inkwell/forms/{id}/disable` disables an owned form (owner/admin may disable any).

Signed-out GET `/api/forms/{id}` returns title, public-role label and expiry only. POST `/api/forms/{id}/code` takes email and turnstileToken and returns challengeId/expiry. POST `/api/forms/{id}/verify` takes challengeId, code and turnstileToken and returns a once-visible 10-minute admissionToken. Both changes require this installation’s Origin; preparation tokens and API keys are refused. Codes expire at 10 minutes, permit five attempts, and are limited to three mail requests per normalized email/form in a rolling hour, including failed delivery. Verification cannot set recipients, fields or the form definition.

Configure the Worker secret `TURNSTILE_SECRET_KEY` before code requests. Siteverify must return success and this installation’s hostname with action `inkwell_form_code` or `inkwell_form_verify`, respectively. Missing configuration fails closed; provider failures never create envelopes. Tests fake only the Turnstile and mail network edges. No credential values belong in source or arguments.

Owner/role/permission loss suspends old forms permanently; restoration permits publishing a new form, never reviving the old one. Changed/deleted/inaccessible templates refuse admission. Form configuration, grants and email admission state are installation state excluded from document archives. The hourly pass deletes admission PII after 24 hours; public management statistics do not expose admission addresses or tokens.
