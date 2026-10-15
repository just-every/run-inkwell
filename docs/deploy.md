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
