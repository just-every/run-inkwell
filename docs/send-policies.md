# Member groups and permission profiles for sending

Settings → Send policies selects the whole account or an existing member group or
permission profile. A send combines the account policy with every group and
profile assigned to its principal. Scopes can only narrow the account: restrictive
modes win, template lists intersect, approval requirements accumulate, and any
scope can refuse a scheduled release. Every scope starts with person mode for ad hoc, template and bulk sends, and off
for web-form and API sends. Every applicable scope must opt in before a policy
send can release.

The current member-group/profile HTTP door is for a signed-in owner or admin:

- `GET /api/inkwell/send-policy-scopes` lists scopes and their current per-source policies.
- `POST /api/inkwell/send-policy-scopes` creates or saves a scope with `commandId`,
  `kind` (`group` or `profile`), `name`, `members` (active member IDs), and
  `expectedVersion` (0 for creation). For an update, also supply `id` and the
  returned version. Member IDs come from `GET /api/inkwell` as an owner/admin.
- A membership save needs a sign-in no older than 15 minutes and keeps an immutable
  before/after entry. Retry the same command ID to retrieve its original receipt.
- `account.send_policy` accepts `scope` and `scopeId` together with its existing
  source, expected version, mode, templates, approval, deferral and reason fields.
  Making a source autonomous or widening its templates also needs a fresh sign-in.

These memberships grant no document access or other capability. ADMIN-002's
sharing/departure behavior and ADMIN-008's broader permission flags remain separate
work. Those clauses must retain these narrowing rules when they add their doors.
API keys and preparation tokens cannot manage scopes. A request and every deferred
release fence the complete live membership set and every contributing policy
version in the invitation batch. A held draft needs fresh eligibility confirmation
and never releases merely because a restriction is removed.

Scope memberships/history are installation state and are excluded from document
archives like roles and shares. ADMIN-005 still owes account-wide audit/restore
integration; per-policy and scope-version history is retained locally now.
