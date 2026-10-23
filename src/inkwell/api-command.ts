import type { Actor } from './model'
/** Receipts are separated by credential, even when keys share a bound member. */
export const apiCommandActor = (actor: Actor) => actor.apiKeyId ? `api-key:${actor.apiKeyId}` : actor.agentId ?? actor.id
