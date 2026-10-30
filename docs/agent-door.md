Inkwell uses Base’s shared door through its production Worker at `/mcp`,
`/api/rer/agent-policy`, `/agents` and the native person approval and audit doors.
MCP versions 2026-07-28 and 2025-11-25 use one registry. The runtime source is
pinned to Base `114ef7a61f080da053af783c5fbe06f625d692cc` (rer 0.2.88);
the CLI dependency is separately pinned to released `@runeditrun/rer@0.2.88`.

The declared subset is tools, policy, pause, audit and idempotency. Events,
resource templates/reads, prompts and subscriptions are absent from the public
surface and return `capability_not_declared`. This is a partial adoption of the
larger agreement-operations target in the ct contract. It does not complete its
seeded week, integrations, autonomous release, signature or filing journeys.

## Supported agreement work

| Tool | Scope | Classes | Native clauses |
| --- | --- | --- | --- |
| `inkwell.drafts.prepare.prep_001` | agreements:prepare | standard, sensitive | PREP-001, PREP-003, DELEGATE-001, AGENT-001 |
| `inkwell.envelopes.manage.manage_005` | agreements:read | sensitive | ACCESS-001, MANAGE-005, RECORD-002 |
| `inkwell.records.verify.record_001` | agreements:read | standard | RECORD-001, RECORD-002 |
| `inkwell.workspace.snapshot` | agreements:read | standard | ACCESS-001, MANAGE-001 |

Preparation calls the same `prepareEnvelope` and `readDraft` path as the UI:
fixed PDF bytes, document custody, native recipient and field validation, current
roles and atomic persistence remain authoritative. It creates an internal draft.
A person must still review the exact bytes and authorize sending through Inkwell’s
native confirmation. Company approval of preparation does not authorize release.
The exact proposed input digest, filename, title and recipients form the held
approval summary. Native preparation records `<agent> for <person>` and retains
both native identities and the actual named company approvers.

Inspection exposes a bounded projection of the visible envelope’s identity,
revision, title, state, original fingerprint and timeline attribution. It returns
no signing capability, bearer credential, private follow-up reply or PDF body.
Verification reads the real stored artifacts and checks their hashes and native
chain. Imported records do not become verified native records. Supplied document
and agreement text is untrusted. Reads use the same policy and audit pipeline.
No mutation of an existing envelope or native reversal is registered, so there
is no stale-record mutation or Undo claim in this subset.

## Native identity and authority

The authoritative people store is `oa_operators`. A native member’s sender or
viewer role comes from `iw_member_roles`, defaulting to viewer. Envelope ownership,
current shares and named native approver access remain authoritative. Business
policy never creates a native grant. Preparation rechecks current roles inside
the native atomic write, including native preparation-token revocation.

Signed Business `owner_id` binds to the installation’s original native setup
owner; signed team `id` binds through `bs_team.operator_id`. Sponsor admission
never selects a person by token email. Business owner maps to policy owner,
Business team admin to editor, member to no policy role. Local promotion cannot
change that Business mapping. Unknown or inactive subjects are refused.

An owner-issued native preparation token works at MCP with only
`agreements:prepare`. Its existing `/api/inkwell/agent/prepare` endpoint now
invokes that same registered tool and policy pipeline. Unanswered policy refuses
with `policy_unset`; Pause and revocation stop the next effect. Approval returns
a named-person URL; an agent cannot decide it. Token issuance/revocation remain
the native signed-in owner’s commands. API keys and provider, signing, import
and installation credentials keep their separate purposes.

## Bootstrap, providers and limits

The setup manifest retains setup-token mode: normal verification posts the native
`/auth/bootstrap` lifecycle. A paired installation’s `/auth/owner-claim` keeps its
signed claim validation; no raw setup token is sent to that signed endpoint.
Business settings and policy use the installation’s existing trust ring.

These registered actions have no outbound provider effect. Consequently no seed
network edge is declared; the verifier keeps undeclared outbound hosts closed.
Sending, SMS, reminders, scheduled release, private follow-up, connected filing,
CRM intake and inbound return retain their existing native doors. They need
original consent custody and execution-time admission before broader shared-door
exposure. Although Base now supplies a consent-bearing execution context, this
subset does not claim those native queues are integrated.

No provider cost, spend reservation or spend-cap enforcement is claimed;
`spend: {none: true}` describes this journey. Discovery request capacity and
native PDF/recipient validation are capacity bounds, not company policy limits.
Client erasure across retained shared-door evidence and multi-sponsor isolation
need separate integrated proof. The target contract’s unavailable jobs remain
gaps; they are not registered as placeholder tools or relabeled as device work.
