# Company agents and the shared door

Inkwell's existing agent credential is a preparation credential. Its owner can
issue and revoke it, and it can prepare a PDF envelope for a person's later
approval. It cannot send, sign, manage members, read private replies or borrow a
browser session. API keys and provider, signing, import and installation
credentials retain their separate purposes. See [agent workflows](agent-workflows.md)
for the existing native agreement workflows and their limits.

The shared Base agent-door runtime is copied into `src/modules/agent-door` at
Base commit `d555e789cffb744a9f83d76ebe42a2e3bdd7a055`. Its Business settings
and operator-account dependencies are recorded at that same revision in
`base-copies.json`. The Business settings, Business person mappings and door
tables have new additive migrations. Copying these sources does not expose an
Inkwell MCP endpoint or enable company-agent execution: the production Worker
does not yet construct the shared door.

## Native identity and authority

The authoritative people store is `oa_operators`. Inkwell keeps Base's owner and
admin roles; a native member is a sender or viewer according to
`iw_member_roles`, with viewer as the default. Current envelope and template
shares further constrain a sender. A company-agent adapter must re-read those
native facts for every action, resource and approval execution.

Business identity must use the signed Business document's `owner_id` and team
`id`, through `bs_settings` and `bs_team`, to bind to native operator IDs. Email
alone cannot establish sponsorship. Business owner maps to policy owner,
Business team admin to policy editor, and Business member to no policy role.
Promoting a person locally does not promote their Business policy role.

The production owner-claim handler supports a signed claim when the owner-claim
trust is configured. The current setup manifest declares setup-token mode.
Verification must reconcile that declaration with the actual production owner
lifecycle before claiming successful signed bootstrap; a raw setup token must
never be sent to the signed claim endpoint.

## Deferred effects require their original consent

Invitations, SMS, scheduled releases, reminders, notifications and connected
filing have durable native execution paths. An agent effect queued through any
of those paths needs its original verified sponsor, agent and consent binding.
The dispatcher must recheck current authority, Business and local Pause, agent
revocation and that exact consent before the next effect. An uncertain provider
outcome must retain its receipt and must not be blindly resent.

At the copied Base revision, `Principal` has `consent`, but the public
`ToolContext` passed to native `run` does not. Its context constructor drops
that field, and `door.invoke` accepts only a person and agent. There is no
public execution handle carrying the original consent into a native queue.
Consequently Inkwell cannot yet connect these deferred effects to the shared
door while preserving consent-specific revocation. Looking up the latest call
for an agent, treating an agent ID as a consent, or passing caller-supplied
consent would not establish the original verified binding.

The shared runtime needs a public verified execution/consent context suitable
for native durable custody and revalidation. Until that is available and the
native adapters and conformance journey are complete, Inkwell makes no shared
MCP, company-policy, agent approval or agent spend-enforcement claim. Provider
cost registration is unsupported at this Base revision.
