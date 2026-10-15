An owner can import completed submissions as an archive library. Imported evidence
stays separate from documents signed in Inkwell. Inkwell preserves the uploaded
PDF bytes, provider metadata and event history; it does not certify historical
identity checks or generate an Inkwell signing certificate for imported records.

Use DocuSeal's documented `GET /submissions/{id}` response, described in the
[official API reference](https://www.docuseal.com/docs/api). That response includes
submission status, completion time, submitters, signed document URLs, the audit
PDF URL and submission events. The list endpoint's response is less complete.
The documents endpoint can return partially completed documents, so completion
must be checked on the submission and every submitter.

Create this local transport envelope; `provider`, `account`, `submissions` and
`files` describe Inkwell's upload format, not a DocuSeal export endpoint:

```json
{
  "provider": "docuseal",
  "account": "stable-source-account-label",
  "submissions": ["Replace this string with a get-submission response object"],
  "files": [
    {"url": "Exact documents[].url", "name": "signed.pdf", "base64": "PDF bytes as base64"},
    {"url": "Exact audit_log_url", "name": "audit.pdf", "base64": "PDF bytes as base64"}
  ]
}
```

Provide every signed document and the separate provider audit PDF. No files are
downloaded during import. Omit API keys and other credentials. The account label
must remain stable: it and the provider submission ID identify the source record.
The archive is bounded to 750,000 UTF-8 bytes including base64, with 1–100
submissions, so its native effects fit the ordinary D1 atomic transport. Expanded
evidence for one submission must also fit this bound. Split larger collections
into smaller archive files. A changed completed submission under an already
imported source identity conflicts rather than overwriting the existing evidence.

`tests/fixtures/docuseal/archive.json` is an uploadable synthetic example using the
documented response shape. Its valid PDFs come from Locket's deterministic PDF
writer. They contain no real signatures or historical verification evidence.

## HTTP flow

All endpoints require a current Base owner session. POST requests require the
installation's exact Origin header and `Content-Type: application/json`.

1. `POST /api/inkwell/import/preview` with `{ "archive": ... }`. The archive may
   be an object or its original JSON text. Text preserves the uploaded file's exact
   bytes; an object preserves the JSON serialization received by the parser. The
   response contains `fingerprint`, Base `counts` and `diagnostics`. Preview checks
   PDF structure and evidence completeness without creating a job or native rows.
2. Show the fingerprint, counts and rejected submissions to the owner. On their
   explicit apply action, `POST /api/inkwell/import/apply` with the identical
   archive and `fingerprint`. The server recomputes the plan and refuses a changed
   fingerprint before job creation. It retains the immutable plan and exact
   originals, then applies native records and provenance in the same D1 batch.
3. `GET /api/inkwell/import/jobs` returns `{ "jobs": [...] }`; a job has `id`,
   `state`, `checkpoint`, `total`, `fingerprint` and `error`. Apply processes at
   most ten submissions per request. `POST /api/inkwell/import/resume` with
   `{ "id": "job id" }` continues from the journal without the source upload.
4. `POST /api/inkwell/import/undo` with `{ "id": "job id" }` reverses a completed
   job, or rolls back its partial applied work after interruption. Repeat to resume
   a bounded reversal. Exact metadata and file-byte predicates
   preserve native edits by refusing conflicting reversal. Job originals and
   reversal history remain after undo.

`GET /api/inkwell/import/records` returns `{ "records": [...] }` with title,
provider source ID, completion time, signers, and artifact links plus SHA-256
fingerprints. The artifact paths are `/records/:id/artifacts/signed`, `/audit`,
and `/certificate` beneath the import prefix. `certificate` aliases the upstream
audit PDF; it is provider evidence. The returned artifact links include an index
when a submission has multiple signed files. Downloads recompute file hashes.

Rejected records retain diagnostics and original upload custody but create no
native archive row. Their source identities are distinguished from an accepted
submission, allowing a corrected later archive to import successfully. Base
reports duplicate source records and keeps durable ownership claims across
repeated imports. Replaying the same apply operation resumes its retained job.

## Custody, restore and erasure integration

`0015_import_kit.sql` is generated from the vendored Base D1 exports, in initializer
order. `0016_imports.sql` creates `iw_imported_archives` with `id`, unique
`source_id`, canonical JSON `value` (metadata and file bytes), and `revision`.
`src/inkwell/imports/tables.ts` lists the complete native and import-kit schema
tables for the installation's archive policy. Keep job plans, originals, active
and historical provenance, source claims, reversal state, custody revisions,
tombstones and erasure journals together. None of these rows references an auth
operator through a foreign key. Their stable principal is `role:owner`; current
owner authority is always checked against Base's session/operator tables.

Ordinary imports do not use stream/preparation/native-staging APIs. Their staging,
assertion and tally tables remain empty after successful calls; the complete
table inventory includes them to avoid silently dropping future custody state.
There are no application-owned transient tables or external object-store writes.

The exported `eraseImportedArchive(env, session, id, checkpointStatements)` uses
Base `retireD1ImportCustody`, with `withdraw-affected-artifacts`, and deletes the
native archive row atomically with the caller's portability redaction checkpoint.
The checkpoint array is required; use Base portability's redaction statements,
not a constant predicate. A JSON original containing the erased submission is
withdrawn whole, including its other submissions, rather than claiming selective
byte erasure. Retain and export Base's resulting tombstones and erasure journal,
and enforce portability's restore fence so an older archive cannot resurrect it.
The helper is an integration seam; there is no imported-record erasure HTTP route.
