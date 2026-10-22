# Part 11 profile and qualification

The profile is **unvalidated**. Enabling controls, recording an FDA reference, or passing the technical journeys does not qualify or certify an installation. No UI control can mark it validated.

An owner/admin enables the profile on an unlocked native draft. It cannot be removed; copies and templates retain it and reset signature proof. Paper signing is refused. Every signature needs an admin-verified account and a fresh emailed code. Email-link-only, owner-setup, review and development sessions do not supply a second component. There is no fallback to ordinary signing when a component is unavailable.

An admin records the account, verified printed name and identity-verification method before the first signature. The method describes the verification actually performed outside Inkwell; Inkwell does not inspect an ID or certify that procedure. Never enter ID numbers or document images. Reverification replaces current authority, preserves the verification history, and revokes the old signer password and identity sessions. Account status, email and version are checked again in the signature transaction. A restored installation retains business records and signed verification snapshots, but credentials and live verification authority do not travel; reverify and enroll there.

## Separate credential enrollment

Conservative enrollment default, pending ct review: a different owner/admin verifies the signer (self-verification is refused), receives a one-use 256-bit activation token, shown once and valid for 24 hours, and delivers it through a separate trusted channel. It is never emailed automatically. The verified account holder signs in to Settings and uses that token to choose a separate signer password of 15–128 characters. Only a salted PBKDF2-SHA-256 hash (600,000 iterations) is stored. Email alone cannot enroll or reset the password. Reverification and a new separately delivered token are required for recovery.

On the verified signing page, enter the signer password to open an independent browser identity session. That session grants no app access, lasts at most 24 hours, and uses an HttpOnly, SameSite=Strict session cookie (Secure on HTTPS). Each recipient still verifies their invitation and disclosure. A later envelope in the same continuous session requires a new recipient/session-bound email code, without reentering the password. End the signer identity session explicitly or close the browser when finished. Hosted completion, decline and consent withdrawal revoke it before returning the device to host sign-in. Active verified OIDC sessions are also accepted, bound to the current account, provider generation and provider pin; provider qualification is still required for that installed composition. Passkey enrollment is not implemented.

Signature codes last 10 minutes, permit five attempts, and may be requested once per 60 seconds, ten times per link. Password attempts are limited to five per account per ten-minute window. Exhausting codes or password attempts records a security alert and immediately attempts mandatory email to every active owner/admin, regardless of personal notification choices. Settings lists the alert; delivery state remains on the envelope's mail timeline. Network failure cannot guarantee receipt within one minute and must be reviewed by the operator. The committed qualification run measures the network-edge success case; hosted provider receipt remains installation qualification.

Approval, Review, Responsibility and Authorship are built in. Only the owner adds custom meanings. Their exact text, the admin-verified printed name, UTC signing instant, identity component and reauthentication evidence are frozen into the signed record; the PDF manifestation and certificate carry them. No later meaning or identity change edits a completed record. Legacy records are verified under their original recorded method and are never upgraded to two-component signatures retroactively.

The owner/admin records the organization's actual 11.100(c) certification date and reference in Settings. This is a customer statement of a submission, not a certification by Inkwell or proof of FDA acceptance. The history is append-only through product doors and travels in the installation archive, without password material or activation tokens.

## Execute qualification on the candidate

From a clean committed checkout, using its pinned Node and pnpm versions, build the installed candidate, then run:

```sh
pnpm exec vite build
node scripts/qualify-part11.mjs --phase all --installed-version FULL_40_HEX_SHA --output /absolute/private/qualification-directory
```

The output must be outside the repository. The command rejects a different SHA or a dirty tracked tree. IQ records versions, migration fingerprints and the edition check. OQ executes `tests/compliance.test.mjs`. PQ drives the emitted Worker at 1440 and 390 through `tests/journeys/healthcare.mjs`, including keyboard, accessibility-tree and light/dark axe checks. Screens and raw execution logs remain in the private output directory. Each phase writes an exact-SHA receipt; receipt success means that phase's technical command passed, never that all matrix obligations are qualified. Run the same scripts on the installed version in the customer's controlled environment, retaining configuration and deployment evidence there. A mail network fake does not prove real delivery or provider availability.

Use [traceability.md](traceability.md) to record every row's executed test, run identifier, reviewer and any customer procedure. Customer controls must be executed and reviewed, not inferred from application tests. 'Validated' means IQ/OQ/PQ executed on the installed version, every listed requirement citing a test passed in that run, and a reviewed change log since the last validated version. The scripts always report **unvalidated** until this independent qualification work is complete.

For a change log, the IQ receipt includes the installed SHA and optional `--since-validated FULL_40_HEX_SHA` history. If there is no previously validated version, it explicitly says none was supplied; it does not invent one. Preserve the previous qualification package and assess every intervening change before approving a new validated version.
