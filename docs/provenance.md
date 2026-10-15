Inkwell was generated from the committed runeditrun/base foundation at
`fc0e1041efa55771142bbb57c4ab4743147e264d`, composed as `signatures/inkwell`, then
converted to package mode with published `@runeditrun/rer` 0.2.17. The generated
`foundation.lock.json`/`composition.lock.json` record its starting provenance;
product files are now edition-owned. Base's auth, D1, theme, mail, onboarding,
import-kit and portability supply the shared mechanisms.

Adapted sibling code (MIT; sibling repositories were not changed):

- Locket `82478229f356d017bda62b4944b584138ef9671c`, `src/locket/pdf.ts`:
  certificate and fixture PDF writing; `execution.ts`: fixed-version execution
  handoff and transactional approval guards. The handoff manifest lists the
  envelope, signers, dates and content hashes for manual reconciliation.
- Chest `7bf6e3eff153323fedfdd2ef6abb7bfd0222419a`, `src/chest/blobs.ts`:
  content fingerprints and integrity checks when reading artifacts. Inkwell
  stores bounded chunks in D1 instead of requiring object storage.
- Evidence `a65a3cbd193f35b9ab8a8a639fea430aeb6b110d`,
  `src/evidence/upload.ts`: bounded bytes and retained-byte SHA-256 receipts.

An audit hash proves consistency of the retained bytes and event chain. A person
with direct control of the database could replace both data and hashes; this is
not an external timestamp authority. Email codes establish access to the named
mailbox, not government identity. No qualified signature, KYC, notarisation or
universal validity is claimed. The owner determines document eligibility.

Original PDFs are immutable after preparation. Typed signature marks are added
to a derivative executed PDF; its fingerprint is distinct from the original.
A separate certificate and JSON event trail preserve the process. Imported
DocuSeal PDFs retain their upstream provenance and are never represented as
signatures witnessed by Inkwell.

Inkwell now pins the exact published RER 0.2.19 package, which supplies bounded, nonblocking macOS listener ownership inspection. No local RER patches are applied.
