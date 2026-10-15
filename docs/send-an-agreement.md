Prepare an envelope, approve it, and Inkwell invites each recipient in order.

## Prepare the envelope

1. On **Envelopes**, choose **New envelope**.
2. Enter an **Envelope title** and choose the **Fixed PDF document**: the final version,
   up to 2 MiB. The original PDF is never changed after this.
3. Under **Recipients · sign in this order**, enter each person's name and email address in
   the order they should sign. You can add up to five with **Add recipient**; each needs a
   different email address.

## Place fields

Once the PDF is chosen, its pages appear beside **Place fields**.

1. Choose the **Recipient** and the **Field type**: signature, text or date.
2. Adjust the **Field label**, **Width (%)** and **Height (%)** if you need to.
3. Click the page where the field belongs. With a keyboard, focus a page and press Enter
   to place the field at its centre.

Every recipient needs at least one signature field. Each field shows its recipient's
number, such as `2: Signature`. Remove a misplaced field with **×** in the list and place
it again.

Choose **Save prepared envelope**. The envelope is now `prepared`, and nothing has been
sent.

## Approve and send

Open the prepared envelope from the list.

1. Choose **View document and fields** and check every page, recipient and field.
2. Under **Human approval**, confirm that you reviewed the envelope and that it is
   eligible for electronic signature.
3. Choose **Approve and invite first recipient**.

Inkwell emails the first recipient their private link. The envelope is now
`awaiting signature`. Each later recipient is invited automatically after the one before
them signs.

When you run Inkwell locally, the messages go to the development outbox instead of real
inboxes; see [Getting started](/docs/getting-started#signing-in-with-an-email-link).

## Void an envelope

To stop an envelope that is not finished, open it and choose **Void envelope…**, enter the
reason and choose **Confirm void**. Recipients can no longer sign it, and the reason stays
in the audit trail.

Next: [What signers see](/docs/signing).
