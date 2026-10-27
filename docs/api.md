# API keys and envelope clients

The current API can read envelopes and artifacts, list templates, prepare unsigned PDF drafts, send under an autonomous API policy, correct, resend and void envelopes with a manage scope. Its machine-readable description is `GET /api/v1/openapi.json`. API-001 remains partial: OAuth with PKCE, webhook management and account-audit integration are not shipped. Test-mode keys and source SDKs are described in [SDKs and test mode](./sdk-test-mode.md).

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


## Public signing forms

Native owner/admin sessions GET/POST `/api/inkwell/web-form-permissions` to inspect or version a sender’s explicit grant (`memberId`, `enabled`, `expectedVersion`, `commandId`). A sender needs this grant and live template access; it never grants record access. GET `/api/inkwell/forms` lists forms the publisher manages, with counts-only statistics and share links. POST creates a new immutable form with `templateId`, `templateVersion`, `publicRole` (zero-based signer), `fixedRecipients` (null for the public role, fixed name/email for every other role), and `commandId`. Optional totalLimit/dailyLimit/expiryDays default to 100/50/90; totalLimit is at most 10,000 and expiryDays at most 365. Daily counters use UTC calendar days. Republish creates a new ID. POST `/api/inkwell/forms/{id}/disable` disables an owned form (owner/admin may disable any).

The response includes publicUrl (`/form/{id}`), qrUrl (downloadable SVG) and an iframe embedSnippet. The public form verifies email before any envelope exists, then continues into the existing disclosure and signer page. Other recipients, template content and fields are fixed; the submitter can fill and sign only their role. Company recipients receive the ordinary countersigning invitation.

For API clients, signed-out GET `/api/forms/{id}` returns title, public-role label, expiry and the public Turnstile site key. POST `/api/forms/{id}/code` takes email and turnstileToken and returns challengeId/expiry. POST `/api/forms/{id}/verify` takes challengeId, code and turnstileToken and returns a once-visible 10-minute admissionToken. POST `/api/forms/{id}/submit` takes name, admissionToken, a fresh turnstileToken and commandId; no recipient, field or other template overrides are accepted. It atomically consumes admission and submission quotas with envelope creation. Autonomous policy returns signingPath and a verified-email signer cookie; off/person policy returns an unsigned held draft. Changing policy back on never releases a hold. The qualifying publisher confirms eligibility or voids it from its dashboard detail; owner/admin may take over that review only after publisher loss. The submitted form provenance remains with the envelope.

Codes expire in 10 minutes, permit five attempts, and are capped at three mail requests per normalized email/form in a rolling hour, including failed delivery. A verified email may submit once per form per rolling 24 hours; an IP may submit ten times per rolling hour across forms. Form total and UTC-day limits are atomic; policy sends also consume the 3,000/hour account budget. Over-limit calls return 429 with Retry-After and create no envelope or invitation. All changes use this installation’s Origin; agent and API-key credentials are refused at form-management and public admission/submission doors.

Configure `TURNSTILE_SITE_KEY` and Worker secret `TURNSTILE_SECRET_KEY` before use. Siteverify must return success, this installation’s hostname, and action `inkwell_form_code`, `inkwell_form_verify` or `inkwell_form_submit`. Missing configuration fails closed. Tests fake the Turnstile widget/siteverify and mail network edges; no credential values belong in source or arguments.

Owner/role/permission loss permanently suspends old forms; restoration permits a new publication, never revival or transfer. Changed/deleted/inaccessible templates refuse admission. Form settings, permission and transient admission/rate state stay outside document archives; envelope provenance travels with document custody. Admission PII is purged after 24 hours and hashed IP rate identifiers after one hour. Raw IP/UA are retained only in RECORD-002 envelope evidence. Management statistics contain counts only. ADMIN-008 future profiles narrow these grants and ADMIN-005 adopts their history before claiming a complete account audit.


Envelope organization uses the ordinary envelope access checks. Search accepts
`folder` (folder ID), `tag` (exact tag), `customField` (field name) and
`customValue` (exact value). Text search also matches tags and custom values.
Names and values use the dashboard's case-insensitive matching. The signed-in
`GET /api/inkwell/envelopes.csv` door exports every matching page, with IDs,
titles, statuses, folder IDs, tags and custom fields. Spreadsheet formulas are
escaped. A sender's export never includes envelopes outside their current access.

Preparation and template inputs accept `tags` (up to ten strings) and
`customFields` (up to twenty objects with `name`, `value` and `required`). Names
are unique ignoring case, up to 80 characters; values are up to 500 characters.
Templates may leave a required default blank; using that template must supply a
nonblank value. Required fields cannot be removed or made optional by a draft
edit. Template combination combines requirements and asks for a value when
defaults conflict. Public forms require complete defaults before publication.
Custom values are business metadata; they are not signer fields on the PDF.

The dashboard's Folders control creates folders, grants view or edit shares and
sets retention. Editors cannot reshare or move records. Viewers remain readers.
Only the original sender, an owner or an admin moves an envelope, and they must
manage the destination folder. Retention changes require an owner or admin;
blank means inherit the account rule. A folder rule replaces account years and
uses the same 30-day warning, legal hold and fenced erasure as account retention.
Folder settings and shares stay out of document archives. A restored folder ID
is inert unless that folder still exists in the destination installation.
This conservative placement and restore default awaits ct approval. HubSpot
handoff of custom envelope fields is not available until INTEG-001 ships.


The OpenAPI preparation schema describes `customFields` and `tags` for file and
template requests. A required template custom field must have a value; supplying
`required: false` cannot remove that template requirement. Omitting tags inherits
the template tags. These values are returned on the envelope record.

The documented envelope-list query accepts `folder` (an exact folder ID),
`customField` (a case-insensitive name), `customValue` (a case-insensitive exact
value used with `customField`), and `tag` (a case-insensitive exact tag). Omitting
`customValue` matches any value for that field. Every filter retains the bound
member's current record access. Folder placement remains a member-session action.


## Embedded signing and preparation

The embedding authorization and custody defaults have CT policy approval with
riders; implementation acceptance is recorded in CONTRACT.md. These member-session doors are available
only to an owner or admin on the application's own origin; API keys and agent
preparation credentials cannot use them.

1. POST `/api/inkwell/embed-origins` with `origin`, `enabled: true` and
   `consent: true` explicitly allows one exact HTTPS parent origin. No origins
   are allowed initially. Wildcards, paths, credentials and opaque origins are
   refused. GET of the same path lists allowed origins. Setting `enabled: false`
   immediately revokes that origin's existing launches. Local installations
   additionally accept exact loopback HTTP origins for development.
2. POST `/api/inkwell/embeds` with `origin`, `consent: true` and `mode: "sign"`
   plus the existing recipient `token`, or `envelopeId` and zero-based `signer`,
   creates a recipient view URL without bypassing verification. Either mode
   requires a native sign-in no older than 15 minutes. With `mode: "prepare"`, it authorizes the
   existing preparation editor and explicit human sending review. That launch
   can create one envelope, then read, edit and approve only that envelope.
3. Use the returned `url` as the iframe source in the allowed application's
   page. Treat it as a private credential. A launch expires after 15 minutes and
   is redeemed once, atomically. Redemption redirects to a separate public
   session location. Reload that session to resume; retrying the original
   launch refuses. A lost redemption response requires a fresh authorized
   launch. The session never extends the original launch deadline.
   Embedded authentication uses Secure, HttpOnly partitioned cookies; a browser
   must support partitioned cookies. The ordinary native session is sealed on
   the server, checked on every embedded request and never exposed to the
   parent, embedded JavaScript or document archives.

Before granting an origin or authorizing a launch, explain the exact parent,
purpose, recipient or single draft allocation, and expiry. Consent allows only
the status events below. It neither signs for a recipient nor automatically
sends an invitation or grants the parent access to document content. The
recipient separately authenticates and consents inside Inkwell. Changing or
removing an origin permanently invalidates its outstanding authority; adding it
again cannot revive an old launch or session. If browser cookie custody is
unavailable, use the native continuation or obtain a fresh launch.

The real signing screen retains recipient verification, access codes, routing,
disclosure and document visibility. Successful actions send `inkwell.signed`,
`inkwell.declined` and `inkwell.closed` messages to the exact authorized parent
origin. Sending that reaches the awaiting-signature state additionally sends
`inkwell.sent` with `envelopeId`. Internal approval, a sending hold or a deferred
release does not emit that event. The record's status remains authoritative.
Signing and closing messages contain no
recipient details, values, documents or credentials. Closing revokes the launch.
No incoming parent message can sign, prepare or approve a document.

Validate both the event origin and its source frame before accepting a message:

```js
const frame = document.querySelector('iframe')
window.addEventListener('message', event => {
  if (event.origin !== inkwellOrigin || event.source !== frame.contentWindow) return
  if (event.data?.type === 'inkwell.signed') showSignedState()
})
```

Origin changes, launch authorization and closure have local audit records.
`ADMIN-005` retains the obligation to include these in the unified account log.
The public-door journey is `tests/journeys/embedding.mjs`, named “Embedded signing
and sending”, with independent allowed and refused host pages at 1440 and 390.

## HubSpot preparation and contact import

The native member-session HubSpot connector requires an owner or admin, the
application origin and explicit authorization. Installation credentials
`HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_ACCOUNT_ID` are private Worker bindings;
requests and archives never carry them. Network-edge fakes establish acceptance,
while live provider provisioning and interoperability remain separate.

POST `/api/inkwell/hubspot/prepare` with `commandId`, `consent: true`,
`recordType` (`deals` or `contacts`), `recordId`, `templateId`, and `mappings`.
Each mapping names a template `field`, CRM `object`, internal `property` and
optional `readOnly` boolean. Deal preparation may select a `contactId` for
contact mappings. Ordinary template `recipients` and `customFields` are
supported. Values come from server-side CRM reads with recorded sources and
signer locks. Repeating a command returns the same envelope without another read.

Preparation alone sends no invitation, grants no new envelope access and grants
no follow-up authority. An eligible CRM owner may default escalation; a human
must separately authorize the envelope's follow-up grant. Requested integration
sending (`send: true`) additionally obeys the integration source policy and live
release checks. Completion write-back exposes status, key fields, custom
metadata, one timeline event and the exact executed PDF; inspect or retry it at
`/api/inkwell/hubspot/envelopes/:id/writeback`.

Contact sync uses `/api/inkwell/hubspot/sync` operations: `authorize` records
explicit consent and a versioned `definition` naming account, scope, properties,
mappings, shared-contact destination, update behavior and cadence. `start`
takes `authorizationId` and an idempotent `requestId`; `continue` takes `runId`.
One defined authorization spans bounded pages. Current authority is rechecked
for every page; revocation or lost authority permanently retires authorization.
Progress, failures and local-edit conflicts are visible through
`/api/inkwell/hubspot/progress`. Imported contacts appear in native search and
recipient autocomplete. Provider identity prevents duplicates; local edits are
preserved for explicit conflict resolution. Audit records retain scope and
version without imported field values. The built HubSpot settings expose configuration, authorization and progress.
