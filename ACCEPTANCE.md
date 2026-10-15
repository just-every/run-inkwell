# First release

- An owner or admin uploads one fixed PDF, places fields, and explicitly approves two ordered recipients; each recipient verifies an email code, consents and signs in turn.
- The sender downloads the executed PDF, certificate, audit JSON and handoff manifest; recomputation verifies document and audit fingerprints. A sender can void an unfinished envelope.
- An agent with a scoped token prepares an envelope; only a signed-in person approves sending, and preparation and approval remain in the audit trail.
- The owner previews a documented-shape DocuSeal archive, approves its fingerprint, imports its signed PDFs and provider evidence, reads the durable journal, and undoes the import.
- The owner exports/restores document custody into an empty installation, erases a native envelope, and carries the later erasure archive to prevent an older backup restoring it.

Not needed: a domain or run site, brand redesign, live mail/provider calls for local use, payment processing, qualified signatures, notarisation, KYC, legal advice, universal validity claims or direct Locket/Chest network delivery. Imported signatures retain their provider provenance. Independent release review is a later round.
