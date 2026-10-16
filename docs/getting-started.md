Run Inkwell on your own computer with one line. It is free and needs no account anywhere.

## What you need

- macOS, Linux, or Windows with WSL2.
- Node 22 or later and pnpm 10.12.4. `rer` selects the exact Node version Inkwell pins for
  you, so you do not need to change your global Node.

## Get Inkwell and start it

```sh
npx -y @runeditrun/rer dev just-every/run-inkwell
```

That one line installs `rer`, the Run Edit Run command, clones Inkwell and starts it. To start it again later, run `cd run-inkwell && rer dev`.

The first start installs dependencies, builds Inkwell and creates its local database, so
it can take a few minutes. When it is ready, `rer dev` prints two lines:

- `RER_READY`: the address Inkwell is running at.
- `RER_OPEN`: a private link that opens Inkwell signed in as you, the owner. Treat it like
  a password and do not share it.

## Finish setup

Open the `RER_OPEN` link. Inkwell shows **Finish setup** with your name and email. Check
the confirmation box and choose **Finish setup**; the workspace opens on **Envelopes**.

Until setup is finished, the installation's home page shows **Finish setup**; afterwards it
shows **Sign in**.

## Signing in with an email link

To sign in the ordinary way, start with `rer dev --login`. Locally no email leaves your
computer: `rer dev --login` prints the address of the development outbox, where every
message Inkwell would send is kept. Open the newest sign-in message, follow its link and
choose **Confirm**.

## Stop and start again

```sh
rer dev --stop
```

Run `rer dev` again in the same folder to start where you left off. Your envelopes and
settings stay in the checkout's local data.

Next: [Send an agreement](/docs/send-an-agreement).
