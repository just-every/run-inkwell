// CI runs four disjoint browser groups; ordinary verification runs every journey.
import { spawnSync } from 'node:child_process'
const journeys = [
 "tests/journeys/signing-mobile.mjs",
 "tests/journeys/contacts.mjs",
 "tests/journeys/accessible-signing.mjs",
 "tests/journeys/envelope-detail.mjs",
 "tests/journeys/correct-envelope.mjs",
 "tests/journeys/templates.mjs",
 "tests/journeys/mobile-sending.mjs",
 "tests/journeys/field-placement.mjs",
 "tests/journeys/in-person.mjs",
 "tests/journeys/import-retention.mjs",
 "tests/journeys/conditional-fields.mjs",
 "tests/journeys/prefill.mjs",
 "tests/journeys/routing.mjs",
 "tests/journeys/internal-approval.mjs",
 "tests/journeys/signing-groups.mjs",
 "tests/journeys/template-maintenance.mjs",
 "tests/journeys/healthcare.mjs",
 "tests/journeys/field-types.mjs",
 "tests/journeys/document-fields.mjs",
 "tests/journeys/supplements.mjs",
 "tests/journeys/freeform-settings.mjs",
 "tests/journeys/freeform.mjs",
 "tests/journeys/template-release.mjs",
 "tests/journeys/send-policies.mjs",
 "tests/journeys/forms.mjs",
 "tests/journeys/sms.mjs",
 "tests/journeys/provider-auth.mjs"
]
const selector = process.env.INKWELL_JOURNEY_SHARD
if (selector && !/^[1234]\/4$/.test(selector)) throw new Error('INKWELL_JOURNEY_SHARD must be a shard from 1 to 4 with a total of 4')
const selected = selector ? journeys.filter((_, index) => index % 4 === Number(selector[0]) - 1) : journeys
console.log(`Browser journeys ${selector ?? 'all'}: ${selected.join(', ')}`)
for (const file of selected) {
 const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env: process.env })
 if (result.error) throw result.error
 if (result.status !== 0) process.exit(result.status ?? 1)
}
