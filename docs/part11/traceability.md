# Part 11 traceability matrix

Status: **unvalidated**. This is the complete row inventory and technical evidence map, not executed qualification results. In the private installed-version qualification package, fill in the exact passed test/run and reviewer for every row. A technical test covers only the behavior described below. Unproved procedural, hosted and provider controls keep the installation unvalidated.

| Requirement | Feature or control | Technical test / executed qualification still required |
| --- | --- | --- |
| 11.10(a) | Accuracy, reliability, consistent performance and invalid/altered record detection | OQ: `tests/compliance.test.mjs` — “Signature controls: explicit owner/admin consent, fresh per-signature email proof, bounded attempts and printed immutable manifestations”; IQ/OQ/PQ review and customer intended-use validation pending |
| 11.10(b) | Readable PDF/certificate/audit and archive copies | Same OQ test downloads executed PDF, public verification and exact restored bytes; installed export inspection pending |
| 11.10(c) | Protected retrieval and retention | Same OQ test archive restore and verification; customer's retention, backup and retrieval exercises pending (`RECORD-005` carries product retention) |
| 11.10(d) | Authorized individuals only | OQ: “Signature controls: signed-in, link-only, signing-group and hosted doors cannot bypass fresh recipient proof” and “Verified signer credentials: private one-use enrollment, separate continuous sessions, immediate revocation and no mailbox-only downgrade” |
| 11.10(e) | Time-stamped audit trail and preservation of prior facts | OQ manifestation test binds reason/name/time to hash-chained signature and restored bytes; installed audit retention/review procedure pending |
| 11.10(f) | Operational sequencing | OQ door test requires verification, disclosure and fresh code in each signing mode; customer workflow qualification pending |
| 11.10(g) | Authority checks | OQ credential-custody test refuses unverified, revoked, inactive and mailbox-only identities; “Verified OIDC signer: public provider linking and sign-in require fresh signature code; provider-off immediately refuses the next signature” proves the OIDC component and provider-off refusal; OQ manifestation test checks owner/admin enablement |
| 11.10(h) | Device/input checks | OQ door test binds code to recipient/link/session; PQ: `tests/journeys/healthcare.mjs` validates built form controls; installed device and environment qualification pending |
| 11.10(i) | Personnel education, training and experience | **Customer control.** Execute and retain training/competence procedure and its test, reviewer and run; no application assertion substitutes |
| 11.10(j) | Accountability for electronic signatures | **Customer control.** Execute and retain written responsibility/accountability policy test, reviewer and run; no application assertion substitutes |
| 11.10(k) | Documentation distribution, access, revision and change control | IQ migration/edition fingerprints and change log; customer's controlled documentation distribution and revision procedure test pending |
| 11.30 | Open-system authenticity, integrity and confidentiality | OQ verifies code/session binding, hash chain, custody and authorization; installed TLS, network, threat model and any required digital-signature/encryption measures must be qualified; `RECORD-003` cryptographic seal remains separate/unshipped |
| 11.50 | Printed name, date/time and meaning in readable records | OQ manifestation test asserts Responsibility and custom text in executed PDF; PQ built signing controls at both widths |
| 11.70 | Signature/record linkage | OQ manifestation test verifies immutable event binding, artifact verification, public PDF match and restored bytes; installed tamper/retention procedure pending |
| 11.100(a) | Unique identity, never reassigned | OQ credential-custody test checks member/version-bound authority; customer unique-account/non-reassignment procedure test pending |
| 11.100(b) | Identity verification before first signature | OQ credential-custody and door tests; admin-verified name and method preserved. Customer executes and reviews actual verification procedure |
| 11.100(c) | Organization's FDA certification | OQ manifestation test records date/reference and refuses invalid input. Customer supplies actual submission/reference and reviews it; application does not certify acceptance |
| 11.200(a)(1) | Two distinct components; later signature in a continuous session | OQ credential-custody test refuses email-only and requires separate password plus code; manifestation test reuses identity session on a later envelope with fresh code |
| 11.200(a)(2) | Used only by genuine owner | OQ private one-use enrollment and revocation; customer's separately delivered activation, identity verification and credential-custody procedure pending |
| 11.200(a)(3) | Misuse by another requires collaboration | Separate admin verification/activation and signer-chosen password; customer separation/collaboration procedure test pending |
| 11.200(b) | Biometric signatures | No biometric signature door is implemented or qualified; customer records not applicable and reviews installed composition |
| 11.300(a) | Unique identification-code/password combinations | OQ account-bound credential and session tests; customer unique identity issuance procedure test pending |
| 11.300(b) | Periodic checking, recall and revision | OQ credential-custody test proves immediate admin reverification/revocation; customer periodic review/recall procedure and dates pending |
| 11.300(c) | Lost/stolen/compromised credential deauthorization | OQ credential-custody test proves old password/session stay revoked; customer loss/reporting and supervised replacement procedure test pending |
| 11.300(d) | Unauthorized-use detection and urgent reporting | OQ manifestation test asserts fifth failed code attempt sends mandatory security mail and lists the alert within one minute at network edge; installed real-provider timing and incident-response procedure pending |
| 11.300(e) | Initial and periodic testing of devices/tokens | OQ one-use activation and session tests; no hardware token reader is shipped. Customer tests installed devices and records applicability and periodic schedule |
