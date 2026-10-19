A completed envelope keeps its whole record in one place, and you can check it again at any
time.

## Download the record

Open a completed envelope from **Envelopes**. Its buttons download:

| Button | What you get |
| --- | --- |
| **Original PDF** | The exact file you uploaded, unchanged. |
| **Executed PDF** | A copy of the original with every typed signature and field value placed on it. |
| **Certificate** | A PDF recording each signer and when they signed, the evidence collected (ordered email-code checks and explicit consent), the original and executed PDFs' fingerprints, and every audit event. |
| **Handoff manifest** | The envelope, signers, dates and content fingerprints, to file the record elsewhere by hand. |
| **Audit JSON** | Every event in the envelope's audit trail. |

## Check it again

Under **Artifact integrity**, Inkwell shows the SHA-256 fingerprint of the original, the
executed PDF and the certificate. Choose **Verify stored artifacts**: Inkwell recomputes
each fingerprint from the stored bytes and checks every link of the audit chain. A
successful check reads **Integrity checks passed.** with the number of events in the chain.
**Verification details** lists the result for each file.

If a check fails, Inkwell says which file no longer matches.

## Let anyone check a copy

Anyone holding an executed PDF or certificate from this Inkwell can check it at `/verify`,
without signing in. They choose the file and **Verify document**. Inkwell fingerprints the
upload and looks for a completed envelope whose executed PDF or certificate has exactly that
fingerprint, then rechecks that envelope's stored files and audit chain. A match names the
envelope, its completion time and its signers. An altered copy, or any other PDF, reads
**No match.** and shows nothing about any other envelope.

The same check is open to scripts: `POST /api/verify` with the PDF as the body and
`Content-Type: application/pdf` answers `{"match": false, "sha256": …}` or the matching
envelope's title, completion time and signers.

## The audit trail

**Audit trail** lists every step with its time: who prepared, approved, verified an email
code and signed, when the envelope completed and when the certificate was created. Each
event is chained to the one before it, so a missing or edited event breaks the chain and
the verification above reports it.

The fingerprints and chain show that the stored bytes and events are consistent with each
other. They are not an external timestamp: someone with direct control of the database
could replace both.

Next: [Move in from DocuSeal](/docs/move-in).
