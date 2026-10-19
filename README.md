<p><img src="public/brand/mark.svg" width="72" height="66" alt=""></p>

# Inkwell

Send a fixed PDF for ordered electronic signatures and keep the executed file,
certificate and audit trail in your own Cloudflare account. MIT licensed.
[First-release jobs](ACCEPTANCE.md) define this seed's scope.

The public website and run guide are at [run-inkwell.com](https://run-inkwell.com).

## Clone and run

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
rer dev just-every/run-inkwell
```

The first line installs `rer` for you alone (with its own Node if you have no Node 22 or later); the second clones,
installs and starts Inkwell. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-inkwell` does
both in one line. To start it again later, run `cd run-inkwell && rer dev`. The checkout pins rer **0.2.45**, Node
**22.20.0** and pnpm **10.12.4**. Rer installs the pinned dependencies and selects
the pinned tools itself. First launch builds and migrates the local D1 database.
Open the private `RER_OPEN` URL printed by the command. It signs in the local
owner; complete the setup page, then open the workspace. Do not share this URL.
No external email is sent in local mode. Stop with `rer dev --stop` (or
`npx --yes @runeditrun/rer@0.2.45 dev --stop`).

For ordinary email-link sign-in, use `rer dev --login`, open the local outbox
address it prints, and follow the newest sign-in message. Confirm the link.
The outbox requires the local browser key granted by RER_OPEN; a public request
cannot read it. To install for a real owner, run `npx -y @runeditrun/rer install just-every/run-inkwell`, then from the checkout `rer setup --owner-email YOU@YOUR-DOMAIN` and `rer dev`; use the same saved owner on setup reruns.

## Send an agreement

1. Choose **New envelope**. Enter a title and upload the final PDF (up to 2 MiB).
   Add recipients in signing order. The first release supports one to five;
   the core journey uses two. Each recipient needs a distinct email address.
2. Choose the recipient and field type, then click the rendered page to place
   fields. Every recipient needs a signature field. Text and date fields are
   also supported. Remove an unwanted field and place it again. Save the
   prepared envelope.
3. Review **View document and fields**, the recipients, and eligibility for
   electronic signing. Check the approval box and choose **Approve and invite
   first recipient**. Preparation alone sends nothing.
4. Locally, open the development outbox at `/__dev/outbox` from the authenticated
   local browser. Read the **Please sign** message and open its signing link.
   Click **Email me a code**, then read the separate verification message in
   the outbox and enter its six-digit code. In a deployed installation the
   configured mail provider delivers these messages to the recipient.
5. Review the document, fill your fields, and explicitly consent before signing.
   The next recipient's invitation is created only after the previous signature
   is recorded. Repeat for recipient two. Refresh the sender workspace.
6. Open the completed envelope. Download **Executed PDF**, **Certificate**,
   **Audit JSON**, and **Handoff manifest**. **Verify stored artifacts** recomputes
   all fingerprints. Give the PDFs and manifest to Locket or Chest manually;
   this release makes no external handoff call. The original PDF remains intact.

Each signer's adopted signature (typed in a style, drawn, or an uploaded image) is placed into the final PDF. This release uses a standard
Latin PDF font: unsupported characters in names, titles or typed fields are
refused with an explanation; the original PDF can retain its own embedded fonts. Inkwell does not apply a
qualified cryptographic PDF signature or establish legal eligibility for you.
Do not use it for documents excluded from electronic signing. The certificate
records the actual email-code check, consent and sequence; it is not KYC or
notarization. An unfinished envelope can be voided with a recorded reason.

Owner/admin roles can prepare, approve and void. Members can read native
records. Only the owner manages agent credentials, move-in, backup/restore and
erasure. Server handlers enforce these boundaries independently of the UI.
Identity settings are linked from the workspace.

## Agent preparation

In **Agent access**, issue a preparation token and save it privately. It can call
`POST /api/inkwell/agent/prepare` with `Authorization: Bearer …` and the preparation
payload in [agent commands](docs/agent-commands.md). It cannot approve or sign.
A person reviews the resulting prepared envelope in the workspace and approves
it. Revoke the token in the same tab when finished. Tokens and signer codes must
never go in source control, shell history, logs or screenshots.

## Move in from DocuSeal

In **Move in**, select `tests/fixtures/docuseal/archive.json` for a synthetic,
documented-shape example. **Run dry-run preview**, review the counts and
fingerprint, check the approval box, and apply. The imported library keeps
provider PDFs and their fingerprints. Inspect the durable import journal, then
**Undo this import** and confirm. Large jobs can be resumed from their journal.

For your data, follow [the archive format](docs/import-docuseal.md): DocuSeal
submission detail JSON plus separately supplied signed/audit PDF bytes. No API
keys or provider calls are needed. Imported records remain provider evidence;
Inkwell never invents historical signing verification.

## Backup, restore and erasure

**Archive → Download full archive** saves document bytes, fields, audit history,
import originals/journals and erasure tombstones. Browser transfers are limited
to 24 MiB; the CLI supports larger installations. Restore into a fresh installation
using **Inkwell archive JSON**, confirm the file, then **Restore archive**.
Authentication, sessions, API tokens, verification codes and pending mail jobs
are not transferred; the destination keeps its own owner and private settings.
Existing signer invitations can request new codes after restore at their saved
origin. A changed origin needs new envelopes; do not repurpose an old link.

The owner can permanently erase a native prepared, completed or voided envelope
from its detail screen by typing `ERASE`. Void active envelopes first. Export
again after erasure and keep that newest archive as the erasure journal. On a
fresh destination, attach it as **Later erasure archive** when attempting to
restore an older backup. Old backups cannot know about later deletion without
that journal; keep it separately. Import undo reverses native imported records
but intentionally keeps its source custody and journal.

The CLI uses the same Base archive policy, in its streaming `.rer` format:

```sh
rer dev --stop
rer export --output exports/inkwell.rer
# In a fresh, configured destination:
rer import --input /private/path/inkwell.rer --yes
# When restoring against a later erasure journal:
rer import --input /private/path/older.rer --journal /private/path/newer.rer --yes
```

Browser `.json` and CLI `.rer` are different wrappers around Base's archive
stream. Use the matching restore door. Private archives contain personal data.

## Deploy to your Cloudflare account

Stop local dev, then run:

```sh
rer dev --stop
rer deploy --dry-run
rer deploy
```

The dry run builds and validates configuration without provider requests. A real
deploy needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for your intended
account, plus `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN`, `MAIL_API_KEY` and a
verified mail sender. Supply private deployment values through your shell's
secret store or a mode-0600 environment file accepted by `rer deploy --env-file`;
never commit them. `deploy.json` declares the Worker and D1 migration plan. Set
its public `MAIL_FROM` to your verified sender before deploying; the default
`auth@example.invalid` is deliberately not deliverable. Default mail is Resend.
Do not change project, edition, Worker, package or D1 identities.

The deploy command provisions the declared resources, applies migrations and
checks health. It prints the installation URL and owner-claim instructions.
Claim the owner, sign in, and complete setup there. A domain is optional: a
workers.dev installation is enough. Review the provider plan and use only your
intended account. Deployment does not run tests. No hosted deployment or real
provider delivery is claimed by this first seed round.

## Develop

```sh
rer install
pnpm run test:api
pnpm run typecheck
rer verify
```

Stop dev before builds or verification. Verify builds the real Worker, runs
public-route integration tests and ordinary email-link sign-in, then checks the
hosted output and hydration. GitHub runs one Verify workflow per main commit.
The suite stays below the [200-test budget](test-budget.json).

Started from Base `fc0e1041efa55771142bbb57c4ab4743147e264d`; see
[reuse and trust boundaries](docs/provenance.md). The run site's look (the design desk's
Inkwell look of 18 Oct 2026: white grid paper, heavy Geist headings with an emerald-to-blue second line, white hairline
cards and the smiling jade envelope mark in `public/brand/`) is defined in `public/rer-theme.css`, with fonts in
`public/fonts/`; the app's styles are in `public/app/`, on the tokens in `public/rer-theme.css`.

## Run site

`rer build --site` writes the static run site to `dist/site`: the homepage
(`src/site/landing/`), the Run page at `/run`, and the docs at `/docs`, built from
`docs/site.json` and the Markdown beside it. Edit those Markdown files to change the
docs; the build fails on a broken docs link or a missing page.
