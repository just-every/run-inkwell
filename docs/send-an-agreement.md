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

The envelope is now `awaiting signature`. When a mail provider is configured, Inkwell
emails the first recipient their private signing link. The recipient requests a verification
code from the signing page. Each later recipient is invited automatically after the one before them signs.

When mail is suppressed in development or no provider is configured, no email or
development outbox message is created. The agreement detail page shows the owner a
recipient-bound private signing link once, with **Copy link**, and a sender-provided
six-digit verification code valid for 10 minutes. Copy the link and code and share both
privately with that recipient. The link expires with the agreement, seven days after the
envelope was prepared; reissuing a link does not extend that deadline. The recipient opens the link, enters the code, and consents to sign. Inkwell clearly says
when no mail provider is configured.

If the link is lost, or the code expires, create a new signing link from the agreement
detail page for the current unsigned recipient and share the new link and code privately.
Creating a replacement revokes the previous link, code and signing session. The link
and code are shown manually only when mail is suppressed; with a configured provider,
the existing emailed-link and code flow remains in place.

## Void an envelope

To stop an envelope that is not finished, open it and choose **Void envelope…**, enter the
reason and choose **Confirm void**. Recipients can no longer sign it, and the reason stays
in the audit trail.

Next: [What signers see](/docs/signing).
