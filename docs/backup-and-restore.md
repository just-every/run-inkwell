Document records can leave Inkwell as ordinary files, and a whole-installation archive can restore them into an empty Inkwell. Open **Archive** as an owner or admin.

## Export all or selected document records

Under **Export document records**, choose all records or search for and select envelopes, then choose **Prepare document export** and **Download document export**. The TAR file contains each available original and executed PDF, certificate, audit JSON, record-custody JSON, a CSV index and `fingerprints.ndjson`. Each index row names its record, file, byte count and SHA-256 fingerprint. Custody JSON includes private comment transcripts under the document record holder’s existing custody access; ordinary audit JSON contains no comment text. Store exports privately.

The download uses a stable snapshot: later edits do not change it. It streams directly to disk without loading the complete archive into browser memory. A download client can resume with a single HTTP byte range on the same URL; its ETag identifies the export snapshot. **Discard document export** removes that snapshot. Permanent erasure or retention purge invalidates any snapshot containing the erased record.

Owners and admins export native envelopes. Imported archives retain their existing owner-only custody access. Preparation tokens, API keys, senders and viewers cannot use this export door.

## Download a whole-installation archive

Only the owner builds or restores a whole-installation archive. Under **Whole installation archive**, choose **Build installation archive**. Progress is saved after each bounded part. **Pause transfer**, a network interruption or leaving the page preserves the cursor; return and choose **Resume building archive**. When it is ready, choose **Download installation archive** for the streamed NDJSON file. Interrupted downloads support byte-range resume. **Discard archive job** removes the saved transfer.

The archive holds document custody, fields, certificates, audit history, templates, imported records and journals, and the erasure journal. It omits installation authentication, keys, codes, sessions, member permissions, settings and unsent mail. The destination keeps its own owner, sign-in and settings. Restoring custody does not grant interactive access to a comment thread outside its chosen audience.

## Restore into an empty Inkwell

1. Finish setup in a fresh Inkwell as its owner. Restore requires an empty document store.
2. Under **Restore a large archive**, choose the NDJSON file.
3. If anything was erased after that backup, also choose the newer NDJSON archive under **Later erasure archive**.
4. Confirm that you selected the intended archive and choose **Restore or resume archive**.

The browser reads one bounded record at a time. Each uploaded part has a checksum and a durable cursor; a repeated part is safe. If interrupted, choose the same file again to resume. The destination publishes no document until the complete archive, its closing checksum, every stored document fingerprint and the erasure fence pass. A changed, incomplete or corrupt archive is refused. Use **Discard paused restore** to abandon it before choosing a different file.

For existing small browser backups, expand **Legacy JSON archive** and use the JSON download and restore controls. That wrapper retains its 24 MiB upload limit; the NDJSON transfer above has no aggregate browser-file limit. JSON and NDJSON use their corresponding restore controls. The command-line doors remain available:

```sh
rer export --output exports/inkwell.rer
rer import --input exports/inkwell.rer --yes
```

## Erase an envelope

The owner can permanently erase a prepared, completed, declined or voided envelope: open it, choose
**Erase archived envelope…**, type `ERASE` and choose **Permanently erase**. Void an active
envelope first.

Erasure removes the document and the personal data in it. A tombstone stays, recording that
the envelope was erased.

## Keep erasures erased

An older backup cannot know about a later erasure. After erasing anything, download a new
full archive and keep it: it carries the erasure journal. When you restore an older backup,
attach that newer archive as **Later erasure archive** in the corresponding restore controls (or, from the command line, pass it
with `--journal`) so the erased envelope is not restored:

```sh
rer import --input exports/older.rer --journal exports/newer.rer --yes
```
