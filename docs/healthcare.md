# Healthcare shared responsibility

The healthcare profile is an installation aid. It does not certify HIPAA compliance, verify a provider's configuration, or create a business associate agreement. The buyer arranges agreements with its providers and decides whether this installation and its operating practices meet its obligations before using patient information.

## Inkwell's responsibility

An owner or admin enables the profile in **Settings → Healthcare profile**. Operational request logs contain only a fixed event name, a fixed door category and an HTTP status. They contain no document text, field values, request or response bodies, URLs, query strings, cookies or error messages. Provider delivery receipts retain normalized delivery facts and a fingerprint of the verified event, not its raw body or subject. The same boundary applies to errors and refused requests.

These diagnostic logs are separate from the signed business record. Original and executed PDFs, field values, consent, certificates and the hash-chained audit evidence remain intact. Messages queued for delivery and the local development outbox are delivery records, not operational logs. They may contain sensitive information and require the same protection as the agreement. Completed-copy attachments deliberately deliver signed evidence to a party.

Member access tracking runs whether the profile is enabled or disabled. It records each workspace member's last successful authenticated request across application pages, API, authentication, import and archive doors, including a newly issued member session. Successful means an HTTP response below 400. Times are stored in UTC and displayed in the reviewer's local time. Anonymous recipient sessions and preparation-agent bearer tokens do not count as workspace member access. Concurrent requests can only advance the timestamp.

**Review member access** returns every account, including invited and inactive accounts, with its current role, status and last recorded access. A person with no recorded access is labeled explicitly. The report is available only to owners and admins. Review it regularly and remove or restrict unneeded access through People and Sign-in settings. Existing accounts have no historical activity backfill; the report starts recording when this version is installed.

The profile, member access times and provider diagnostics are installation state. They are excluded from portable document archives, like account identities and sessions; review the destination account and re-enable its profile after restoring. Signed evidence still travels with the archive.

## The buyer's responsibility

Before using patient information:

1. Arrange the required agreements with Cloudflare, mail and any connected notification or other service providers. Confirm that each chosen service, plan and configuration is appropriate for the data you will send. Inkwell cannot inspect or attest to those agreements.
2. Review Cloudflare's Worker logging, tracing, Logpush, security analytics and any external error or session-replay collectors. Do not capture request or response bodies, document contents, form fields, authentication headers or private signing URLs. The shipped Worker configuration disables invocation logs to avoid recording request URLs; review any account-level override. Other provider-managed HTTP logs and retention are controlled in your account, independently of this profile. Avoid putting patient details in filenames, envelope subjects, URLs or notification text.
3. Review mail and connected notification providers' body/attachment capture and diagnostic retention. Delivery itself can contain confidential content; choose the secure-link completed-copy option when attachments are inappropriate. Restrict access to mail queues, the development outbox, backups and provider consoles. Do not use real patient data in local or demo runs.
4. Limit members and administrators, review their access, protect sign-in with your chosen identity provider, and keep the installation and its dependencies current. Store setup secrets outside source control and rotate them through the provider's own controls.
5. Set retention and legal holds deliberately, protect archives, test restoration, and define incident response and deletion procedures. Keep signed evidence for the period your organization requires.

The profile enforces Inkwell's diagnostic format; it does not change the provider's account settings or establish that provider receipt or compliance verification occurred. Recheck provider settings when adding a service. Future API, integration, identity and agent capabilities inherit this diagnostic boundary before shipping (API-001 through API-004, INTEG-001 through INTEG-011, IDV-002 through IDV-005, AGENT-001 through AGENT-009).
