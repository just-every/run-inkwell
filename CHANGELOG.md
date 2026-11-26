# Changelog

## 0.1.0 — 2026-11-26

The first release. Inkwell sends a fixed PDF for ordered electronic signatures and keeps the executed file, certificate and audit trail in your own Cloudflare account.

Prepare Inkwell for hosted installation with a generated delivery descriptor, deployment specification, managed mail configuration and recorded shared-source provenance. Existing project and archive identities are preserved.

### What an owner gets

- **Ordered signing.** Prepare an envelope, place signature, text and date fields, and send it to one to five recipients in signing order. Preparation sends nothing; a person approves the send, and each next invitation goes out only after the previous signature is recorded.
- **Signer checks.** Each signer verifies an email code, consents and signs; the certificate records the code check, consent and order.
- **The record.** The executed PDF, certificate, audit JSON and handoff manifest download from the finished envelope, and **Verify stored artifacts** recomputes every fingerprint.
- **Agents prepare, people approve.** A preparation token can prepare an envelope but cannot approve, sign or read archives, and the audit trail names the agent.
- **Move in from DocuSeal.** A dry run, an approved import with a journal and an undo, keeping provider PDFs and their fingerprints.
- **Your data stays yours.** It lives in your own D1 database, with owner-authenticated backup and restore and erasure that a later restore cannot undo.

### Not in this release

Inkwell applies no qualified cryptographic PDF signature and does not decide whether a document may be signed electronically. The certificate is not identity verification or notarization.

### Upgrading

This is the first tagged release; every migration under `migrations/core` counts as added. Use the committed deployment specification and setup manifest.
