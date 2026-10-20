Prepare an envelope, approve it, and Inkwell invites each recipient in routing order.

## Prepare the envelope

1. On **Envelopes**, choose **New envelope**.
2. Enter an **Envelope title** and choose the **Fixed PDF document**: the final version,
   up to 2 MiB. The original PDF is never changed after this.
3. Under **Recipients**, enter each person's name and email address. You can add up to five
   with **Add recipient**; each needs a different email address. The number beside each
   recipient is their routing order: recipients who share a number are invited together and
   sign in any order, and the next number is invited once all of them have signed. Give
   everyone a different number to sign one at a time.

   To ask a recipient for an access code before they can see the document, type one (4–32
   characters, no spaces) in their optional **Access code** box and tell them the code
   yourself, by phone or in person, never in the invitation email. Five wrong entries lock
   that recipient's invitation; void the envelope and prepare a new one to start again.

## Edit a draft and add messages

A saved envelope is a draft until someone approves it. Open it and choose **Edit draft** to
change anything: the PDF, the title, the recipients and their order, fields, expiry,
reminders and copy recipients. Under **Message** you can set the email subject, a message
for everyone and a private message for each recipient, which only that person sees in
their invitation and on their signing page. An access code you set earlier stays while
that recipient keeps their place in the list; otherwise enter it again.

To send later, tick **Send later** when you approve and choose the date, time and US time
zone. The envelope reads **Scheduled** until then; invitations go out within the hour that
time falls in (Inkwell checks every hour), and nobody can sign before. Scheduling needs mail
set up.

## Place fields

Once the PDF is chosen, its pages appear beside **Place fields**.

1. Choose the **Recipient** and the **Field type**: signature, text or date.
2. Adjust the **Field label**, **Width (%)** and **Height (%)** if you need to.
3. Click the page where the field belongs. With a keyboard, focus a page and press Enter
   to place the field at its center.

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
privately with that recipient. The link expires with the agreement (see [Expiry and extensions](#expiry-and-extensions));
reissuing a link does not extend that deadline. The recipient opens the link, enters the code, and consents to sign. Inkwell clearly says
when no mail provider is configured.

If the link is lost, or the code expires, create a new signing link from the agreement
detail page for the current unsigned recipient and share the new link and code privately.
Creating a replacement revokes the previous link, code and signing session. The link
and code are shown manually only when mail is suppressed; with a configured provider,
the existing emailed-link and code flow remains in place.

## Internal approval (ROUTE-004)

An owner or admin can require a named person to approve envelopes before they go out:
**Settings > Internal approval**. A template can carry its own rule too (the **Internal
approval** section of the template screen); both apply. A rule names one approver by email,
an owner, admin or sender in this workspace, for every envelope or only when a USD number
field with a given label is above an amount. An envelope with that field whose value is not
a locked sender value also needs the approval, since its amount is not known before sending.

When a rule covers an envelope, **Approve and invite first recipient** records your
approval and the envelope waits, locked, for the approver: nobody is invited yet. The
approver gets an **Approval needed** email and finds it under **Waiting for me**. **Approve
and send** sends it exactly as your approval would have; **Reject…** returns it to your
drafts with the reason. Edit it and approve it again to ask again. If you are the named
approver, your own approval counts.

## Paper signatures

Tick **Allow recipients to sign on paper and upload a scan for you to review** while
preparing to let recipients sign by hand instead. When one uploads a scan, you get an email
and the envelope shows **Paper signature to review.** Choose **View upload** to check every
page, then **Accept paper signature**, or **Reject…** with a reason the recipient receives
by email. An accepted upload counts as that recipient's wet-ink signature: the next
recipient is invited, the scan's pages are appended to the executed PDF, and the certificate
marks the signature as wet ink with the scan's SHA-256 fingerprint.

## Reminders

Tick **Remind the recipients whose turn it is by email** while preparing to chase signers
automatically. Set **First reminder after (business days)** and **Then every (business
days)**, each from 1 to 30. Business days are Monday to Friday, Eastern time, and a
reminder goes out from 9 am on the day it is due. Only recipients whose turn it is are
reminded, from the day they were invited; reminders stop once they sign, and for everyone
when the envelope is declined, voided or expires. A recipient whose paper scan is waiting
for your review is not reminded. Each reminder is in the audit trail. When mail is not set
up, no reminders are sent.

## Expiry and extensions

Every envelope expires 120 days after it is prepared unless you change **Expires after
(days)** while preparing it, from 1 to 365 days. Three days before an envelope expires,
Inkwell emails the recipient whose turn it is and the sender a reminder that it is about to
expire. The envelope's detail panel shows when it expires.

To give recipients more time, open the envelope and choose **Extend expiry…**, enter the
number of days and choose **Extend**. Before expiry, the days are added to the current
expiry; after expiry, they count from today and the envelope reopens. Either way the same
document, recipients and signing links carry on, signatures already given stay, and the
audit trail records the extension. An envelope stays open at most 365 days from today.

## Sign your own turn

When you are a recipient and it is your turn, the envelope reads **Waiting for you** and
its next action is **Your turn to sign**. Open it and choose **Review and sign**. Inkwell
opens your own signing page with a fresh private link, which replaces the one you were
sent. Your Inkwell sign-in vouches for you, so no code is emailed: the page opens already
verified, and the certificate names you as the signed-in member. If the sender set an
access code for you, enter it first. Then review the document and sign. Every role,
including members, can sign their own turn this way.

## Sign it yourself

To sign a document nobody else needs to sign, prepare it with yourself as the only
recipient and place your fields. When you approve it, the button reads **Approve and sign
now**: it opens your signing page straight away, and no email is sent at all. The same
happens when you are at the first routing order of your own envelope; the next order is
invited only once you have signed. The certificate names your signed-in session and how
you signed in. Inkwell remembers the signature you adopted (typed, drawn or uploaded) and offers it next
time you sign in the app; adopt a different one to replace it. Once the envelope is complete,
**Send the completed copy…** sends the executed PDF and certificate to up to 20 more
people.

## Copy an envelope

To send the same agreement again, open any sent, completed, declined, voided or expired
envelope and choose **Copy to a new envelope**. Inkwell prepares a new envelope with the
original, unsigned PDF, the same recipients in the same order and the same fields, with no
entered values or signatures. It opens ready for approval like any prepared envelope, and
its audit trail, handoff manifest and certificate name the envelope it was copied from.

## Send from a template

Open **Templates** and choose **New template** to save an agreement you send often: upload the
PDF, name each role in routing order (for example Client and Company Signer), tick **Access
code at each send** for a role that needs one, place each role's fields, and set the subject,
message, reminders and expiry. To send it, choose **Use** and enter only each role's name and
email (and the access code you will give that person). Inkwell prepares the envelope with the
template's fields, routing, messages, reminders and expiry, and it opens ready for approval like
any prepared envelope. The envelope records the template it came from, and the Envelopes
screen's **Template** filter finds every envelope sent from one. Senders see only their own
templates; owners and admins see all of them.

Choose **Edit** on a template to change it: saving makes its next version, and envelopes
already sent keep the version they came from, which their record names. To reuse an envelope
you already sent, choose **Save as template** on its detail page.

## Void an envelope

To stop an envelope that is not finished, open it and choose **Void envelope…**, enter the
reason and choose **Confirm void**. Recipients can no longer sign it, and the reason stays
in the audit trail.

Next: [What signers see](/docs/signing).

## Prefill business values (PREP-008)

Select a text, date, checkbox or USD number field in the preparation inspector.
Set its **Prefill value** and reported source; choose **Read-only for signer**
when the recipient must keep that value. Signatures and calculated fields take
their values through signing and calculation instead. Drafts and templates keep
these defaults. A signer may replace an editable default or clear an optional
one; locked terms are enforced by the server too.

An API caller using `template.use` supplies values by field ID:

```json
{
  "command": "template.use",
  "commandId": "your-unique-command-id",
  "input": {
    "id": "the-template-id",
    "recipients": [{"name": "Mara Quinn", "email": "mara@example.com"}],
    "prefill": {
      "company": {"value": "Acme Workshops LLC", "source": "Deal 902 / company"},
      "amount": {"value": "1250.25", "source": "Deal 902 / amount", "readOnly": true}
    }
  }
}
```

Use the signed-in command door at `POST /api/inkwell/commands`, with its ordinary
origin and session checks. This prepares a draft for human approval. Direct
`envelope.prepare` and `envelope.update` calls put `prefill: {value, source}` and
`readOnly: true` on the field definition. Values and source labels are supplied
by the caller, not verified with the CRM. Native CRM fetching and merging are
part of the HubSpot, Salesforce and Orbit connectors (`INTEG-001/002/003`).

Values are one line, at most 500 characters; sources are one line, at most 200.
Dates use `YYYY-MM-DD`, checkboxes use `true` or `false`, and USD values have at
most two decimal places. The record keeps the prepared value and reported
source separately from the recipient's final signed value.
