Everything Inkwell keeps can leave with you in one file, and go back into a fresh Inkwell.
Backup, restore and erasure are for the owner.

## Download a full archive

Open the **Archive** tab and choose **Download full archive**. The file holds every
envelope's document bytes and fields, certificates and audit history, imported records with
their journals, and the record of anything erased.

It does not hold sign-in sessions, preparation tokens, verification codes or unsent email.
The archive contains personal data: store it privately.

The browser download is limited to 24 MiB. For a larger installation, use the command line:

```sh
rer dev --stop
rer export --output exports/inkwell.rer
```

## Restore into an empty Inkwell

Restore works only into an installation with no envelopes or imported records, so it can
never mix two histories.

1. Start a fresh Inkwell and finish setup as its owner.
2. Open **Archive**. Under **Restore an empty store**, choose the file as **Inkwell archive
   JSON**.
3. If you erased anything after this backup was made, also choose your newest archive as
   **Later erasure archive (optional)**; see below.
4. Tick the confirmation and choose **Restore archive**.

The destination keeps its own owner, sign-in and settings. Signers with open invitations can
request a new code at the same address after the restore.

From the command line, into a fresh, configured installation:

```sh
rer import --input exports/inkwell.rer --yes
```

The browser's `.json` archive and the command line's `.rer` archive are different
wrappers: restore each through the same door it came out of.

## Erase an envelope

The owner can permanently erase a prepared, completed or voided envelope: open it, choose
**Erase archived envelope…**, type `ERASE` and choose **Permanently erase**. Void an active
envelope first.

Erasure removes the document and the personal data in it. A tombstone stays, recording that
the envelope was erased.

## Keep erasures erased

An older backup cannot know about a later erasure. After erasing anything, download a new
full archive and keep it: it carries the erasure journal. When you restore an older backup,
attach that newer archive as **Later erasure archive** (or, from the command line, pass it
with `--journal`) so the erased envelope is not restored:

```sh
rer import --input exports/older.rer --journal exports/newer.rer --yes
```
