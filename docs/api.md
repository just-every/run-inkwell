# API keys and draft clients

The current API can read envelopes and artifacts, list templates, and prepare unsigned PDF drafts. Its machine-readable description is `GET /api/v1/openapi.json`. API-001 remains partial: autonomous sending, OAuth, rate limits, 24-hour idempotency retention, expiry warnings and account-audit integration are not shipped. Test-mode keys and the send, manage and webhook scopes are refused until their capabilities ship.

An owner or admin uses their normal signed-in session and same-origin JSON requests to manage keys. `POST /api/inkwell/api-keys` takes `commandId`, `name`, the bound `memberId`, `scopes`, and optionally `expiresInDays` (365 by default, 1–730 whole 24-hour days). The member must currently be an active owner, admin or sender. A sender's own minting permission waits for ADMIN-008. Minting, scope changes and rotation require a sign-in from the last 15 minutes. Listing and revoking keys need a current owner/admin session. Bearer credentials cannot manage keys or use member-session commands, even alongside a valid browser cookie.

The successful mint response reveals the `iwk_live_` key ID and 256-bit secret once. Store it privately: retrying the same command returns the original metadata and `tokenShown: true`, without the token. Only a SHA-256 hash is stored, with the prefix and last four characters for identification. The list never reveals a secret or hash. Key credentials stay out of document archives and are never restored into another installation. Do not put tokens in URLs, query parameters or logs.

Clients send `Authorization: Bearer <key>` to `/api/v1/` routes, with no browser cookie. Each route requires its own scope:

| Scope | Routes |
| --- | --- |
| `envelopes:read` | `GET /api/v1/envelopes`, `GET /api/v1/envelopes/{id}` |
| `artifacts:read` | `GET /api/v1/envelopes/{id}/artifacts/{kind}` |
| `templates:read` | `GET /api/v1/templates` |
| `envelopes:prepare` | `POST /api/v1/envelopes` |

A read scope never implies artifact access or preparation. The member's current role and record shares still limit each request. A sender can find and read only their own envelopes and those shared with them. Missing or invalid keys receive 401; insufficient scopes and denied record access receive 403. Preparation-agent tokens receive 403 on these routes and cannot become API keys.

Preparation takes the PDF, recipients and fields described in the OpenAPI document, plus a `commandId`. It returns `{ "result": { "id": "..." } }` for an unsigned draft. A retry with the same command ID and input returns the same draft, independently for each key; changed input with that ID receives 409. API send policy being off does not prevent draft preparation. `status: "sent"` is refused with 403 and creates nothing. A person must open the draft and confirm eligibility through the ordinary application before it can send. API keys cannot call that person's approval command.

Use `POST /api/inkwell/api-keys/{id}/scopes` with `commandId` and `scopes` to change a current key's scopes. The next request sees the change; this cannot change the bound member. `POST .../{id}/revoke` with `commandId` permanently revokes the key. The first request after revocation commits is refused, without a cache delay.

`POST .../{id}/rotate` takes `commandId` and optional `overlapDays` (7 by default, 0–7 whole days). The successor retains the member, scopes and original final expiry; the predecessor expires at the earlier of that expiry or the overlap deadline. Zero days retires it immediately. Each predecessor has at most one successor; change scopes on the successor. The successor secret is revealed once, with metadata-only retries just like minting. Revoke either key separately to terminate its remaining access.

A member's record-version change, deactivation, deletion or loss of sender authority permanently suspends their keys. Narrowing or removing a sender's envelope or template share does so too. Restoring the member or share never revives an old key; an owner/admin must issue a new one. Suspension happens when the member or share changes, even if no client request occurs during the loss. Draft writes also recheck key validity, required scope and member authority in the same atomic batch as the draft.
