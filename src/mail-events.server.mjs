import { createDeliveryEventIntake, createD1EventStore } from './modules/mail/index.mjs'

/** DELIV-001: Base's verified delivery-event intake for the configured provider, stored in the installation's D1. */
export function deliveryIntake(env, { tenantId, eventNamespace, authorize }) {
 return createDeliveryEventIntake({ provider: env.MAIL_PROVIDER, key: env.MAIL_WEBHOOK_KEY, tenantId, eventNamespace, store: createD1EventStore({ db: env.DB }), authorize })
}
