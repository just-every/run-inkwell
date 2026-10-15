import { createMailSender } from './modules/mail/index.mjs'
import { demoEffect } from './modules/demo/index.mjs'

export function operatorMail(env) {
 if (env.RER_DEMO === '1') return {
  send: message => demoEffect(() => configuredMail(env).send(message), () => ({ status: 'accepted', provider: 'demo', providerMessageId: message.deliveryId ?? crypto.randomUUID() })),
 }
 return configuredMail(env)
}

function configuredMail(env) {
 return env.MAIL_PROVIDER === 'development'
  ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }) : undefined
  : env.MAIL_PROVIDER ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
}
