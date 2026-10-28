## Dropbox Sign requests and templates

The owner can import completed and declined Dropbox Sign requests, their combined
PDFs with provider audit trails, and supported templates from **Move in**.
Source sender addresses map to active Inkwell members. Choose a fallback administrator
for source owners that cannot be matched; those assignments appear in the review.
Imported records keep their provider provenance and are private to their mapped sender.

1. Select **Dropbox Sign**, enter the API key and fallback administrator, and choose
   **Start account review**.
2. Choose **Review account pages**. Keep the page open while it collects the account.
   Progress survives closing the page, interruption, a provider limit or an expired key.
   Reopen the saved review and supply a current key to continue; a key for another
   source account is refused.
3. Review the total request and template counts, counts by sender and source state, unmapped items and
   fingerprint. A template with an unsupported field type or ambiguous page placement
   is listed for review rather than silently changed.
4. Confirm the review and choose **Approve account import**. Approved pages import in
   the background, one batch each minute. Repeating an interrupted batch creates no
   duplicate records or signing invitations.

**Pause account job** stops further checkpoints until you resume. **Cancel account job**
removes the remaining staged work and keeps records already imported. The provider key
stays only in the open page and outgoing request; it is never saved in the job, logs or
archive. Provider limits pause collection until the displayed retry time. A changed
authorizing owner requires a new review.

Open **Templates** to prepare a new envelope from an imported template. Sending still
requires ordinary review and explicit eligibility confirmation. Retention warnings,
legal holds, erasure and backup restore fences apply to imported requests too. When the
source has no terminal time, the durable import time is labeled as the retention basis.

## DocuSeal archives

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
