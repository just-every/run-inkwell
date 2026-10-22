Put Inkwell on your own Cloudflare account so recipients can reach it from anywhere. A
domain is optional: a `workers.dev` address works.

## Before you deploy

You need:

- a Cloudflare account, with `CLOUDFLARE_ACCOUNT_ID` and an API token in
  `CLOUDFLARE_API_TOKEN`;
- a mail provider for invitations and codes (Resend by default) and its API key;
- a verified sender address. Set `MAIL_FROM` in `deploy.json` to it; the default
  `auth@example.invalid` deliberately cannot deliver.

Keep private values out of the repository. Pass them through your shell's secret store or a
private environment file with `rer deploy --env-file`.

## Deploy

```sh
rer dev --stop
rer deploy --dry-run
rer deploy
```

The dry run builds and checks everything without contacting Cloudflare. The real deploy
creates the Worker and its D1 database, applies the database migrations and checks that the
new installation answers. It prints the installation's address and how to claim it as the
owner.

## After deploying

Open the address, claim the owner, sign in and finish setup. Then send yourself a test
envelope to check that invitations and codes arrive from your mail provider.

To see each message's delivery on the envelope (delivered, opened, bounced), point your
provider's delivery webhook at `https://<your address>/api/inkwell/mail/events` and store its
signing key as the Worker secret `MAIL_WEBHOOK_KEY`: Resend's `whsec_…` signing secret, or
SendGrid's signed event webhook public key. Without it, messages show as sent with delivery
events not set up. Cloudflare Email reports no delivery events, so its messages always show as
sent with no delivery confirmation from the provider.

For signer follow-up replies, configure a Resend receiving domain and its MX records,
set Worker variable `MAIL_INBOUND_DOMAIN` to that domain, and store separate Worker
secrets `MAIL_INBOUND_SECRET` (the receiving webhook's Svix signing secret) and
`MAIL_INBOUND_API_KEY` (a Resend key with receiving-email access). Point the
`email.received` webhook at `/api/inkwell/mail/replies`. These secrets are separate
from outbound delivery events. The envelope's Follow-up panel reports whether the
three bindings are present; this is configuration readiness, not DNS verification
or a claim of mailbox delivery. Replies to invitations sent before follow-up was
enabled cannot be read. Sender-approved follow-up uses fixed messages and the
installation's ordinary outbound mail adapter; no model processes reply text.

### SMS verification

For SMS codes and sender-selected SMS resends, configure `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN` and `TWILIO_FROM` in the installation's Worker secrets. Use the
buyer's Twilio account and a registered sender with permission to message the
recipient's US mobile number. These settings are installation state and stay out
of archives. Choose **SMS code** per recipient or template role and enter the
recipient's mobile number when preparing the envelope. Codes expire after ten
minutes, allow five attempts, and requests are spaced by a minute.

To accept replies to explicitly granted SMS follow-up, configure the sender's
incoming-message webhook to POST form data to
`https://<your-installation>/api/inkwell/sms/replies`. Inkwell verifies Twilio's
signature against its configured origin, account and sender, rejects replays,
and requires the reply code included in the follow-up message. Replies remain
private envelope custody. Selecting SMS in a follow-up grant binds the current
saved numbers; correcting a number requires a new grant. Provider acceptance is
shown separately from delivery confirmation; an uncertain send is never retried
automatically.
