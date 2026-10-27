# Inkwell verification

This edition owns `.github/workflows/verify.yml`. It runs on a push to main
or a manual workflow dispatch. Candidate branches use one manual dispatch
when their push has not already started Verify. Do not dispatch a second run
for the same SHA.

Four parallel jobs run on Ubuntu 24.04 with Node 22.20.0 and pnpm 10.12.4.
Each installs the frozen dependency lock, runs `rer check --profile first-party`,
installs Chromium and runs `pnpm run verify`. The final `verify` job requires
all four jobs to succeed. Each shard job has a 15-minute deadline.

The pinned installer adapter invokes the edition's `verify:app` command. It
checks the edition source lock, builds the application, checks TypeScript,
then runs the API tests, runtime tests and browser journeys. The
`INKWELL_JOURNEY_SHARD` selector partitions the API suite and the committed
browser journey list across the four jobs. Without the selector, the local
commands run their complete respective suites.

`tests/run-api.mjs` discovers every file ending in `.test.mjs` in `tests/`.
`tests/journeys/run.mjs` lists every ordinary browser journey explicitly,
including the HubSpot configuration, import, launch and completion journey.
That journey exercises the emitted application with native sessions and real
D1 storage; only the mail and HubSpot network edges are replaced. The screens
run at 1440 and 390 pixels. Paid-provider interoperability remains separate
from these deterministic tests.

During a clause round, run the touched tests and TypeScript locally. Run the
edition source lock check after the last source, test or documentation change
and after incorporating main. Regenerate it with
`node scripts/edition-authoring/cli.mjs lock`; never edit its hashes directly.
CI supplies the complete verification before landing.

A normal remote-host landing also requires the complete full-history
publication scan on the exact committed candidate, green branch Verify on
that exact SHA, and a guarded fast-forward preserving newer main work.
The main push starts Run site separately. The fleet handoff records the exact
SHA and run identifiers; an earlier green run is never evidence for a newer
candidate.

The retained Base pin and release workflow remain unchanged. This document
records the actual edition workflow, rather than the newer Base template's
optional workflow layout.
