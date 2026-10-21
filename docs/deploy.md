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
