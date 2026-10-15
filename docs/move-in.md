Bring your completed DocuSeal agreements into Inkwell, signed PDFs and provider evidence
included. Moving in is for the owner, and it can be undone.

## What comes across

For each completed DocuSeal submission, Inkwell keeps:

- every **Signed PDF**, byte for byte;
- DocuSeal's audit PDF, kept as the **Provider certificate** and the **Provider audit PDF**;
- the submission's signers, completion time and events, with a SHA-256 fingerprint for
  every file.

Imported agreements live in their own **Imported library**, apart from envelopes signed in
Inkwell. They remain DocuSeal's evidence: Inkwell never presents them as signatures it
witnessed and never creates an Inkwell certificate for them.

## Prepare the archive file

Inkwell reads one JSON file that holds DocuSeal's submission details and the PDF bytes.
It downloads nothing and needs no DocuSeal API key. [The import format](/docs/import-format)
describes the file exactly. Each file can hold up to 100 completed submissions within
750,000 bytes; split larger collections into several files.

To try the flow first, use the synthetic example in the repository,
`tests/fixtures/docuseal/archive.json`.

## Preview, then apply

1. Open the **Move in** tab and choose the file under **DocuSeal archive JSON**.
2. Choose **Run dry-run preview**. Inkwell checks every submission and PDF without saving
   anything, and shows the counts, any diagnostics and the archive's fingerprint.
3. Read the result. Rejected submissions are listed with the reason.
4. Tick the box to confirm you reviewed the counts, diagnostics and fingerprint, then
   choose **Approve fingerprint and apply**.

Inkwell applies exactly the archive you previewed: if the file changes, the fingerprint no
longer matches and the import is refused.

## The import journal

Every import is a job in the **Import journal**, with its state and progress. A large
import applies in steps; if one stops part way, choose **Resume job** to continue from
where it stopped without uploading the file again.

## Undo an import

Choose **Undo this import…** on the job, then **Confirm undo**. Inkwell removes the records
and files that job introduced. The journal entry stays, so you can still see what was
imported and when.

Next: [Back up and restore](/docs/backup-and-restore).
