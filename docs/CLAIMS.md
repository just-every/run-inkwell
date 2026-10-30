# Clause claims

Generated from CONTRACT.md. Acceptance journeys remain in ACCEPTANCE.md.

Inventory: 72 done, 39 partial, 19 missing; 130 total.

| Clause | Status | Evidence | Details |
| --- | --- | --- | --- |
| `HTTP-001` | done | `tests/runtime.mjs`, `src/inkwell/api.ts` | [Contract status](../CONTRACT.md#status) |
| `ACCESS-001` | done | `tests/api.test.mjs`, `src/inkwell/api.ts`, `src/inkwell/members.ts`, `src/inkwell/storage.ts` | [Contract status](../CONTRACT.md#status) |
| `SEND-001` | done | `tests/api.test.mjs`, `tests/web-forms.test.mjs`, `tests/api-keys.test.mjs`, `tests/web-forms.test.mjs`, `tests/journeys/forms.mjs`, `tests/journeys/internal-approval.mjs`, `tests/send-policies.test.mjs`, `tests/journeys/template-release.mjs` | [Contract status](../CONTRACT.md#status) |
| `SIGN-001` | done | `tests/api.test.mjs`, `tests/manual-invitations.test.mjs`, `src/inkwell/signing.ts` | [Contract status](../CONTRACT.md#status) |
| `SEND-002` | done | `tests/api.test.mjs`, `src/inkwell/envelopes.ts` | [Contract status](../CONTRACT.md#status) |
| `DELEGATE-001` | done | `tests/api.test.mjs`, `src/inkwell/agents.ts` | [Contract status](../CONTRACT.md#status) |
| `RECORD-001` | done | `tests/api.test.mjs`, `src/inkwell/pdf.ts`, `src/inkwell/envelopes.ts` | [Contract status](../CONTRACT.md#status) |
| `MOVE-001` | done | `tests/api.test.mjs`, `src/inkwell/imports/index.ts`, `tests/fixtures/docuseal/archive.json` | [Contract status](../CONTRACT.md#status) |
| `PORT-001` | done | `tests/api.test.mjs`, `src/inkwell/archive.ts` | [Contract status](../CONTRACT.md#status) |
| `ERASE-001` | done | `tests/api.test.mjs`, `src/inkwell/archive.ts` | [Contract status](../CONTRACT.md#status) |
| `PREP-001` | partial | `src/inkwell/documents.ts`, `src/inkwell/pdf.ts`, `tests/supplements.test.mjs`, `tests/journeys/document-fields.mjs` | [Contract status](../CONTRACT.md#status) |
| `PREP-002` | done | `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs`, `tests/journeys/document-capacity.mjs` | [Contract status](../CONTRACT.md#status) |
| `PREP-003` | partial | `src/inkwell/business-fields.ts`, `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/ui/field-choices-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/prefill.test.mjs`, `tests/journeys/field-types.mjs`, `tests/journeys/template-maintenance.mjs` | [Contract status](../CONTRACT.md#status) |
| `PREP-004` | done | `src/inkwell/field-rules.ts`, `src/inkwell/pdf.ts`, `src/inkwell/signing.ts`, `src/ui/field-rules-editor.tsx`, `src/ui/signing-field-input.tsx`, `tests/api.test.mjs`, `tests/journeys/conditional-fields.mjs` | [Contract status](../CONTRACT.md#status) |
| `PREP-005` | done | `tests/journeys/field-placement.mjs`, `tests/journeys/a11y.mjs`, `src/ui/field-editor.tsx`, `src/ui/editable-field.tsx`, `src/ui/field-inspector.tsx`, `src/ui/field-layout.ts`, `src/ui/page-thumbnails.tsx`, `src/ui/pdf-viewer.tsx` | [Contract status](../CONTRACT.md#status) |
| `PREP-006` | missing |  | [Contract status](../CONTRACT.md#status) |
| `PREP-007` | done | `src/inkwell/document-fields.ts`, `src/inkwell/pdf-layout.ts`, `src/inkwell/drafts.ts`, `src/inkwell/pdf.ts`, `src/ui/prepare-envelope.tsx`, `tests/document-fields.test.mjs`, `tests/journeys/document-fields.mjs`, `tests/fixtures/fw9.pdf` | [Contract status](../CONTRACT.md#status) |
| `PREP-008` | done | `tests/prefill.test.mjs`, `tests/journeys/prefill.mjs`, `src/inkwell/prefill.ts`, `src/ui/field-prefill-editor.tsx` | [Contract status](../CONTRACT.md#status) |
| `PREP-009` | done | `tests/api.test.mjs`, `src/inkwell/drafts.ts`, `src/inkwell/schedule.ts`, `src/inkwell/mail.ts`, `src/ui/prepare-envelope.tsx` | [Contract status](../CONTRACT.md#status) |
| `PREP-010` | done | `tests/api.test.mjs`, `src/inkwell/envelopes.ts`, `src/ui/envelope-detail.tsx` | [Contract status](../CONTRACT.md#status) |
| `PREP-011` | done | `tests/freeform-fields.test.mjs`, `tests/freeform-policy.test.mjs`, `tests/journeys/freeform-settings.mjs`, `tests/journeys/freeform.mjs` | [Contract status](../CONTRACT.md#status) |
| `PREP-012` | missing |  | [Contract status](../CONTRACT.md#status) |
| `TMPL-001` | done | `tests/api.test.mjs`, `tests/journeys/templates.mjs`, `tests/prefill.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `TMPL-002` | done | `src/inkwell/template-shares.ts`, `src/inkwell/templates.ts`, `src/ui/templates.tsx`, `src/ui/template-sharing.tsx`, `migrations/core/0029_template_shares.sql`, `tests/api.test.mjs`, `tests/journeys/templates.mjs` | [Contract status](../CONTRACT.md#status) |
| `TMPL-003` | done | `src/inkwell/templates.ts`, `src/ui/templates.tsx`, `src/ui/prepare-envelope.tsx`, `src/ui/envelope-detail.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs` | [Contract status](../CONTRACT.md#status) |
| `TMPL-004` | done | `tests/api.test.mjs`, `tests/send-policies.test.mjs`, `tests/journeys/template-composition.mjs` | [Contract status](../CONTRACT.md#status) |
| `TMPL-005` | done | `src/inkwell/template-match.ts`, `src/inkwell/pdf-text.ts`, `src/ui/template-offer.tsx`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-001` | done | `tests/routing.test.mjs`, `tests/journeys/recipient-roles.mjs`, `tests/journeys/routing.mjs`, `tests/journeys/recipient-capacity.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-002` | done | `src/inkwell/model.ts`, `src/inkwell/signing.ts`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-003` | done | `tests/routing.test.mjs`, `tests/journeys/routing.mjs`, `src/inkwell/routing.ts`, `src/ui/routing-rules.tsx` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-004` | done | `tests/routing.test.mjs`, `tests/journeys/internal-approval.mjs`, `src/inkwell/internal-approval.ts`, `src/ui/internal-approval.tsx` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-005` | done | `src/inkwell/signing-groups.ts`, `src/inkwell/signing.ts`, `src/inkwell/certificate.ts`, `src/ui/signing-groups.tsx`, `tests/routing.test.mjs`, `tests/journeys/signing-groups.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-006` | done | `src/inkwell/reassign.ts`, `src/ui/signer-app.tsx`, `src/ui/prepare-envelope.tsx`, `tests/delivery.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-007` | done | `tests/in-person.test.mjs`, `tests/journeys/in-person.mjs`, `src/inkwell/in-person.ts`, `src/ui/host-signing.tsx` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-008` | done | `src/inkwell/contacts.ts`, `src/ui/contacts.tsx`, `tests/api.test.mjs`, `tests/journeys/contacts.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-009` | done | `tests/api.test.mjs`, `src/inkwell/envelopes.ts`, `src/inkwell/own-signing.ts`, `src/inkwell/saved-marks.ts`, `src/inkwell/completed-copies.ts` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-010` | done | `tests/routing.test.mjs`, `tests/journeys/recipient-roles.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-011` | partial | `tests/routing.test.mjs`, `tests/journeys/recipient-actions.mjs`, `tests/journeys/recipient-template-actions.mjs`, `tests/freeform-fields.test.mjs`, `tests/journeys/recipient-freeform-actions.mjs` | [Contract status](../CONTRACT.md#status) |
| `ROUTE-012` | done | `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-001` | done | `src/ui/signing-guide.tsx`, `src/inkwell/progress.ts`, `tests/journeys/signing-mobile.mjs` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-002` | done | `src/inkwell/marks.ts`, `src/inkwell/pdf.ts`, `src/ui/adopt-signature.tsx`, `tests/api.test.mjs`, `tests/journeys/signing-mobile.mjs` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-003` | done | `tests/journeys/accessible-signing.mjs`, `tests/journeys/a11y.mjs`, `tests/journeys/field-placement.mjs`, `src/ui/signer-app.tsx`, `src/ui/signing-guide.tsx` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-004` | done | `tests/api.test.mjs`, `src/inkwell/signing.ts`, `src/inkwell/pdf.ts`, `src/ui/signer-app.tsx` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-005` | done | `tests/api.test.mjs`, `src/inkwell/disclosure.ts`, `src/inkwell/signing.ts`, `src/inkwell/pdf.ts`, `src/ui/signer-app.tsx` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-006` | missing |  | [Contract status](../CONTRACT.md#status) |
| `SIGNX-007` | missing |  | [Contract status](../CONTRACT.md#status) |
| `SIGNX-008` | done | `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs` | [Contract status](../CONTRACT.md#status) |
| `SIGNX-009` | done | `tests/supplements.test.mjs`, `tests/journeys/supplements.mjs` | [Contract status](../CONTRACT.md#status) |
| `IDV-001` | done | `src/inkwell/signing.ts`, `src/inkwell/drafts.ts`, `src/inkwell/corrections.ts`, `src/inkwell/templates.ts`, `src/inkwell/certificate.ts`, `src/ui/prepare-envelope.tsx`, `src/ui/signer-app.tsx`, `tests/api.test.mjs`, `tests/journeys/templates.mjs` | [Contract status](../CONTRACT.md#status) |
| `IDV-002` | done | `tests/delivery.test.mjs`, `tests/journeys/sms.mjs` | [Contract status](../CONTRACT.md#status) |
| `IDV-003` | done | `tests/api.test.mjs`, `src/inkwell/signing.ts`, `src/inkwell/envelopes.ts`, `src/ui/signer-app.tsx`, `src/ui/prepare-envelope.tsx` | [Contract status](../CONTRACT.md#status) |
| `IDV-004` | partial | `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs` | [Contract status](../CONTRACT.md#status) |
| `IDV-005` | partial | `tests/delivery.test.mjs`, `tests/journeys/provider-auth.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-001` | done | `src/inkwell/delivery.ts`, `src/inkwell/mail.ts`, `tests/delivery.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-002` | done | `src/inkwell/bounces.ts`, `tests/delivery.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-003` | done | `src/inkwell/reminders.ts`, `src/inkwell/scheduled.ts`, `src/ui/prepare-envelope.tsx`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-004` | done | `tests/api.test.mjs`, `src/inkwell/expiry.ts`, `src/server.ts`, `src/ui/envelope-detail.tsx`, `src/ui/prepare-envelope.tsx` | [Contract status](../CONTRACT.md#status) |
| `DELIV-005` | done | `src/inkwell/resend.ts`, `src/inkwell/links.ts`, `src/ui/envelope-detail.tsx`, `tests/delivery.test.mjs`, `tests/journeys/envelope-detail.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-006` | done | `src/inkwell/corrections.ts`, `src/ui/prepare-envelope.tsx`, `src/ui/envelope-detail.tsx`, `tests/delivery.test.mjs`, `tests/journeys/correct-envelope.mjs` | [Contract status](../CONTRACT.md#status) |
| `DELIV-007` | done | `tests/api.test.mjs`, `src/inkwell/completed-copies.ts`, `src/inkwell/mail.ts`, `src/ui/completed-copy.tsx` | [Contract status](../CONTRACT.md#status) |
| `DELIV-008` | done | `tests/delivery.test.mjs`, `tests/journeys/accessible-signing.mjs`, `src/inkwell/notices.ts`, `src/inkwell/seal.ts`, `src/ui/activity.tsx`, `migrations/core/0030_notices.sql` | [Contract status](../CONTRACT.md#status) |
| `BULK-001` | partial | `tests/bulk.test.mjs`, `tests/journeys/bulk-capacity.mjs`, `tests/journeys/bulk.mjs` | [Contract status](../CONTRACT.md#status) |
| `FORM-001` | done | `tests/web-forms.test.mjs`, `tests/journeys/forms.mjs` | [Contract status](../CONTRACT.md#status) |
| `MANAGE-001` | done | `tests/api.test.mjs`, `src/inkwell/search.ts`, `src/ui/operator-app.tsx`, `src/ui/envelope-list.tsx` | [Contract status](../CONTRACT.md#status) |
| `MANAGE-002` | partial | `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs`, `tests/hubspot-envelope.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `MANAGE-003` | done | `src/inkwell/own-signing.ts`, `src/inkwell/api.ts`, `src/ui/envelope-detail.tsx`, `tests/api.test.mjs`, `tests/own-signing.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `MANAGE-004` | done | `tests/api.test.mjs`, `tests/journeys/envelope-detail.mjs` | [Contract status](../CONTRACT.md#status) |
| `MANAGE-005` | done | `src/inkwell/timeline.ts`, `src/inkwell/reminders.ts`, `src/ui/envelope-detail.tsx`, `tests/journeys/envelope-detail.mjs` | [Contract status](../CONTRACT.md#status) |
| `RECORD-002` | done | `src/inkwell/certificate.ts`, `src/inkwell/zone.ts`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `RECORD-003` | missing |  | [Contract status](../CONTRACT.md#status) |
| `RECORD-004` | done | `tests/api.test.mjs`, `tests/runtime.mjs`, `src/inkwell/verification.ts`, `src/ui/public-verify.tsx` | [Contract status](../CONTRACT.md#status) |
| `RECORD-005` | done | `tests/api.test.mjs`, `tests/import-retention.test.mjs`, `tests/journeys/import-retention.mjs`, `src/inkwell/retention.ts`, `src/inkwell/retention-imported-envelope.ts`, `src/inkwell/imports/retention.ts`, `src/inkwell/erasure.ts`, `src/ui/legal-hold.tsx`, `src/ui/account-defaults.tsx`, `src/ui/move-in.tsx`, `migrations/core/0031_retention.sql`, `migrations/core/0032_retention_imports.sql` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-001` | done | `src/inkwell/members.ts`, `src/inkwell/shares.ts`, `src/inkwell/api.ts`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-002` | partial | `src/modules/operator-auth/accounts/admin.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-003` | partial | `src/modules/operator-auth/identity/oidc/index.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-004` | partial | `src/inkwell/envelope-defaults.ts`, `src/inkwell/send-policy-scopes.ts`, `migrations/core/0048_send_policy_scopes.sql`, `docs/send-policies.md`, `src/ui/account-defaults.tsx`, `src/inkwell/drafts.ts`, `src/inkwell/templates.ts`, `src/inkwell/freeform-policy.ts`, `migrations/core/0035_freeform_policy.sql`, `src/ui/freeform-settings.tsx`, `tests/freeform-policy.test.mjs`, `tests/journeys/freeform-settings.mjs`, `src/inkwell/send-policies.ts`, `migrations/core/0036_send_policies.sql`, `src/ui/send-policies.tsx`, `tests/send-policies.test.mjs`, `tests/journeys/send-policies.mjs`, `src/inkwell/scheduled-approval.ts`, `src/inkwell/send-hold-notices.ts`, `tests/journeys/internal-approval.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-005` | partial | `tests/account-audit.test.mjs`, `tests/delivery.test.mjs`, `tests/web-forms.test.mjs`, `tests/api-keys.test.mjs`, `tests/send-policies.test.mjs`, `tests/web-forms.test.mjs`, `tests/embedding-cases.mjs`, `tests/journeys/account-audit.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-006` | partial | `tests/delivery.test.mjs`, `tests/journeys/sms.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-008` | partial | `src/inkwell/api-key-permissions.ts`, `migrations/core/0051_api_key_permissions.sql`, `tests/api-keys.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `ADMIN-009` | missing |  | [Contract status](../CONTRACT.md#status) |
| `ADMIN-007` | partial | `src/base/setup.ts`, `src/base/setup-state.ts` | [Contract status](../CONTRACT.md#status) |
| `API-001` | partial | `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `src/inkwell/api-limits.ts`, `src/inkwell/api-key-warnings.ts`, `migrations/core/0050_api_key_warnings.sql`, `migrations/core/0049_api_limits.sql`, `tests/journeys/api-capacity.mjs`, `migrations/core/0038_api_keys.sql`, `tests/api-keys.test.mjs`, `tests/api.test.mjs`, `docs/api.md` | [Contract status](../CONTRACT.md#status) |
| `API-002` | missing |  | [Contract status](../CONTRACT.md#status) |
| `API-003` | done | `tests/journeys/embedding.mjs`, `tests/embedding-cases.mjs`, `tests/embedding-limits.mjs`, `tests/payments-flow.mjs`, `tests/compliance.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `API-004` | partial | `tests/test-mode.test.mjs`, `tests/journeys/bulk.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-001` | done | `tests/hubspot-envelope.test.mjs`, `tests/hubspot-sync.test.mjs`, `tests/journeys/hubspot.mjs`, `tests/hubspot-sync.test.mjs`, `tests/hubspot-envelope.test.mjs`, `tests/journeys/hubspot.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-002` | partial | `tests/hubspot-envelope.test.mjs`, `tests/salesforce.mjs`, `tests/journeys/salesforce.mjs`, `tests/journeys/hubspot.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-003` | missing |  | [Contract status](../CONTRACT.md#status) |
| `INTEG-004` | done | `tests/google.test.mjs`, `tests/journeys/google.mjs`, `tests/delivery.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-005` | partial | `tests/delivery.test.mjs`, `tests/journeys/microsoft.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-006` | done | `tests/delivery.test.mjs`, `tests/journeys/filing.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-007` | missing |  | [Contract status](../CONTRACT.md#status) |
| `INTEG-008` | partial | `src/inkwell/envelopes.ts`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-009` | missing |  | [Contract status](../CONTRACT.md#status) |
| `INTEG-010` | partial | `tests/payments-flow.mjs`, `tests/journeys/payments.mjs`, `tests/payment-sandbox.mjs` | [Contract status](../CONTRACT.md#status) |
| `INTEG-011` | partial | `src/inkwell/api.ts`, `src/inkwell/api-keys.ts`, `src/inkwell/api-openapi.ts`, `tests/api-keys.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `MOBILE-001` | done | `public/manifest.webmanifest`, `src/routes/__root.tsx`, `src/ui/templates.tsx`, `public/app/shell.css`, `tests/journeys/mobile-sending.mjs`, `tests/journeys/correct-envelope.mjs` | [Contract status](../CONTRACT.md#status) |
| `MOBILE-002` | missing |  | [Contract status](../CONTRACT.md#status) |
| `MOVE-002` | missing |  | [Contract status](../CONTRACT.md#status) |
| `MOVE-003` | partial | `tests/remote-import.test.mjs`, `tests/journeys/remote-import.mjs`, `src/inkwell/remote-import.ts`, `src/inkwell/remote-import-provider.ts` | [Contract status](../CONTRACT.md#status) |
| `MOVE-004` | done | `tests/remote-import.test.mjs`, `tests/journeys/remote-import.mjs`, `tests/journeys/remote-import-scale.mjs` | [Contract status](../CONTRACT.md#status) |
| `MOVE-005` | missing |  | [Contract status](../CONTRACT.md#status) |
| `MOVE-006` | missing |  | [Contract status](../CONTRACT.md#status) |
| `MOVE-007` | missing |  | [Contract status](../CONTRACT.md#status) |
| `MOVE-008` | partial | `src/inkwell/imports/index.ts`, `src/modules/import-kit/src/d1/index.ts` | [Contract status](../CONTRACT.md#status) |
| `PORT-002` | done | `tests/supplements.test.mjs`, `tests/api.test.mjs`, `tests/journeys/supplements.mjs`, `tests/journeys/archive-capacity.mjs`, `src/inkwell/archive-ordering.ts`, `tests/journeys/supplements.mjs` | [Contract status](../CONTRACT.md#status) |
| `COMPLY-001` | partial | `tests/compliance.test.mjs`, `tests/compliance.test.mjs`, `tests/journeys/healthcare.mjs`, `tests/compliance.test.mjs`, `scripts/qualify-part11.mjs`, `docs/part11/traceability.md` | [Contract status](../CONTRACT.md#status) |
| `COMPLY-002` | done | `tests/compliance.test.mjs`, `tests/journeys/healthcare.mjs`, `src/inkwell/compliance/profile.ts`, `src/inkwell/compliance/requests.ts`, `src/ui/healthcare.tsx`, `docs/healthcare.md` | [Contract status](../CONTRACT.md#status) |
| `AGENT-001` | partial | `src/inkwell/agents.ts`, `tests/api.test.mjs` | [Contract status](../CONTRACT.md#status) |
| `AGENT-002` | partial | `tests/agent-workflows.test.mjs`, `docs/agent-workflows.md` | [Contract status](../CONTRACT.md#status) |
| `AGENT-003` | done | `tests/delivery.test.mjs`, `tests/journeys/envelope-detail.mjs` | [Contract status](../CONTRACT.md#status) |
| `AGENT-004` | partial | `src/inkwell/envelopes.ts` | [Contract status](../CONTRACT.md#status) |
| `AGENT-005` | missing |  | [Contract status](../CONTRACT.md#status) |
| `AGENT-006` | done | `tests/hubspot-envelope.test.mjs`, `tests/delivery.test.mjs`, `tests/journeys/hubspot.mjs`, `tests/journeys/filing.mjs`, `tests/delivery.test.mjs`, `tests/journeys/account-audit.mjs` | [Contract status](../CONTRACT.md#status) |
| `AGENT-007` | done | `src/inkwell/template-maintenance.ts`, `src/ui/template-maintenance.tsx`, `tests/template-maintenance.test.mjs`, `tests/journeys/template-maintenance.mjs` | [Contract status](../CONTRACT.md#status) |
| `AGENT-008` | missing |  | [Contract status](../CONTRACT.md#status) |
| `AGENT-009` | partial | `tests/agent-workflows.test.mjs`, `docs/agent-workflows.md` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-001` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-002` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-003` | missing |  | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-004` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-005` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-006` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-007` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-008` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-009` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-010` | missing |  | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-011` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-012` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
| `BASE-AGENT-013` | partial | `agent-surface.json`, `tests/agent-door-fixtures.mjs`, `tests/agent-door-journey.mjs` | [Contract status](../CONTRACT.md#status) |
