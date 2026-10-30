# Inkwell verification

This edition owns `.github/workflows/verify.yml` and
`.github/workflows/verify-nightly.yml`. They merge Base's seed Verify
lifecycle with Inkwell's four partitions, their assertions and a 15-minute
shard deadline. Verify runs on every branch push, pull requests and manual
dispatch. Do not dispatch or re-run Verify for a SHA that already has a run.

A plan job checks reusable workflow permissions and shared artifact names with
`node scripts/verify-ci.mjs --check-workflows`, then plans coverage from
`verification.json` with `node scripts/verify-ci.mjs --plan`:

| Coverage | When | What runs |
| --- | --- | --- |
| Full | Any other change | The four push partitions |
| Reuse | A full push proof already covers an identical Git tree | Nothing more; that proof stands |
| Light | A branch push on a push-verified parent changes only contract documents, `sources.lock.json` or evidence | The source lock check, `pnpm run check`, the light helper's reviewed readers and the site build |

The final `verify` job is the required check. It passes only when planning and
the selected coverage succeed; failed or cancelled work cannot pass it.

Each partition runs on Ubuntu 24.04 with Node 22.20.0 and pnpm 10.12.4. It
installs the frozen dependency lock, checks the edition source lock with the
installed authoring package and runs `pnpm run deps`. It installs Chromium and
adds Chromium's system libraries only after a failed launch probe. The pnpm
store, Chromium and apt package caches live in the runner's temporary
directory. The partition then runs `rer check --profile first-party`, the
source lock check, the build, TypeScript, its quarter of the API suite, the
runtime tests and its quarter of the browser journeys. The
`INKWELL_JOURNEY_SHARD=N/4` selector makes the partitions. Partition 1 runs
them through `pnpm run verify`, which keeps rer's hosted-output and hydration
checks; the other partitions use `pnpm run verify:app`. Without the selector,
the local commands run their complete respective suites.

Nightly journeys runs the nightly shard, the 100-recipient capacity journey,
on Monday and Thursday at 05:57 UTC. Release tags beginning with `v` and a
manual Nightly journeys dispatch run every push and nightly shard.

`tests/run-api.mjs` discovers every file ending in `.test.mjs` in `tests/`.
`tests/journeys/run.mjs` lists every ordinary browser journey explicitly,
including the HubSpot configuration, import, launch and completion journey.
That journey exercises the emitted application with native sessions and real
D1 storage; only the mail and HubSpot network edges are replaced. The screens
run at 1440 and 390 pixels. Paid-provider interoperability remains separate
from these deterministic tests.

During a clause round, run the touched tests and TypeScript locally. Run the
edition source lock check after the last source, test or documentation change
and after incorporating main. Regenerate the lock with the installed package,
`node node_modules/@runeditrun/rer/edition-authoring/cli.mjs lock`, then run
the same entry's `check`, which is the check CI runs. Never edit its hashes
directly. CI supplies the complete verification before landing.

A normal remote-host landing also requires the complete full-history
publication scan on the exact committed candidate, green branch Verify on
that exact SHA, and a guarded fast-forward preserving newer main work.
The main push starts Run site separately. The fleet handoff records the exact
SHA and run identifiers; an earlier green run is never evidence for a newer
candidate.
