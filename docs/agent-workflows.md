# Draft information and inbound agreements

These native member-session HTTP doors use the installation's configured outbound mail and authenticated Resend receiving connection. Preparation credentials and API keys cannot use them. Configure the inbound domain, receiving API key and Svix verification secret through the installation's private settings. No language model or live mailbox qualification is claimed.

## Missing information

Read `GET /api/inkwell/envelopes/{id}/information` as a current editor to inspect missing signer-title fields, the W-9 suggestion, outstanding questions, received sources and private attachments. A W-9 suggestion is not a requirement imposed on every agreement: the editor decides whether to authorize that question.

Call `POST /api/inkwell/information` with the envelope `id`, `kind` of `title` or `w9`, the approved person's `email`, and `approveContact: true`. A title request also names `fieldId` and must go to that field's current signer. A W-9 request may go to the sender, an explicitly chosen colleague or a recipient. The operation asks one fixed question and claims one delivery attempt before contacting the mail provider. A duplicate outstanding request is refused. An uncertain provider result stays uncertain and is never retried automatically.

Replies enter the existing authenticated mail-reply endpoint. Only the exact approved sender and current capability can answer. A short, single-line title without material-term language becomes a prefill with its authenticated message reference. A W-9 PDF becomes private source custody with a fingerprint and message reference. It is readable through `GET /api/inkwell/envelopes/{id}/information/attachments/{attachment}` by current editors only. It is never automatically added to signer-visible supplemental documents. An ambiguous answer or one mentioning material changes is flagged for human review and does not change agreement terms.

This first door handles title and W-9 requests. Missing-party discovery, arbitrary missing fields and comparison against CRM entity records remain unimplemented. Current editors can inspect the original answer and apply a separately reviewed correction through native draft editing.

## Inbound agreements

Only the owner may call `POST /api/inkwell/inbound-grant`. Supply `approve: true`, a business `role` label, the active internal signer's `memberId`, one exact authorized `forwarder`, one fixed `returnTo` address and explicit `allowReturn`. The returned account address is a capability: share it only with that forwarder. Saving a new grant revokes the previous address. Calling the same door with `revoke: true` revokes inbound handling.

A signed, fresh receiving event fetches the actual message and its single PDF attachment from Resend. Exact sender authentication, event replay protection and provider-message deduplication precede persistence. The configured business-role signer receives edit access to one prepared native draft and a content-free notice. They review the proposed signature placement and explicitly authorize sending through Inkwell. The agent never signs or sends a signing invitation during intake. Only the configured role mapping is implemented; there is no inferred organizational authority or connector intake from other agreement platforms.

After completion the owner may call `POST /api/inkwell/inbound-return` with `id`. The recorded grant must still be active and explicitly permit return to its fixed address. The executed PDF and certificate are claimed once before delivery. A replay, concurrent second return, revoked grant or missing permission refuses. Uncertain delivery remains visible in custody and is never retried automatically. Intake does not automatically contact the vendor.

## Custody and policy boundary

Private replies and source PDFs travel in the administrative document export and whole-installation archive, follow envelope retention and legal holds, and are removed with envelope erasure. Active addresses, grants, replay state and credentials are excluded from archives. Restoring custody grants no inbound or return authority. Account audit projections contain opaque references and outcomes, never reply text or source capabilities. Member or share authority loss permanently suspends the affected standing authority.

Adopted conservative defaults pending CT review: W-9 source PDFs are private to current envelope editors; inbound authority uses an owner-maintained business-role mapping and an exact approved forwarder; returning the executed copy requires a separate owner action under the live grant. Both agent clauses remain partial while these defaults and the named implementation gaps await review. This is no legal, identity or provider-delivery certification.

## Company-agent boundary

These native workflows do not yet constitute an adopted company-agent MCP
surface. The [shared-door status and consent boundary](agent-door.md) explains
the native people mapping and the missing verified consent context for deferred
effects. Existing preparation credentials keep their narrow purpose.

