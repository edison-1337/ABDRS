/**
 * Public surface of the SMS domain.
 *
 * Everything notification-related is decided here or below: which event fires,
 * what the message says, how it is queued and retried, how a gateway status maps
 * to an internal one, and whether an inbound callback is authentic.
 *
 * The single most important rule in this module set: **a state change never
 * calls a gateway.** It writes an outbox row in the same transaction, and
 * `outbox-worker.js` sends. That is why an approval cannot fail because a phone
 * was busy.
 *
 * @typedef {import('./providers/index.js').SmsProvider} SmsProvider
 * @typedef {import('./providers/index.js').SmsSendResult} SmsSendResult
 * @typedef {import('./providers/index.js').SmsEvent} SmsEvent
 * @typedef {import('./providers/index.js').OutboxStatus} OutboxStatus
 */

import { normalizePhone } from '../utils/phone.js';
import { buildOutboxInsert, resolveThrottlePerMinute } from './outbox.js';

export {
  buildOutboxInsert,
  decideAfterAttempt,
  computeBackoffMs,
  resolveThrottlePerMinute,
  selectDueRows,
  DEVICE_THROTTLE_CEILING_PER_MINUTE,
} from './outbox.js';

export { createSmsProvider, createMockProvider, createTextbeeProvider, isLiveProvider, SUPPORTED_PROVIDERS } from './providers/index.js';
export { renderTemplate, SMS_EVENTS } from './templates.js';
export { verifyWebhookSignature, computeWebhookSignature } from './signature.js';
export { mapGatewayStatus } from './delivery.js';

/**
 * Builds the outbox row for a lifecycle event.
 *
 * Call this INSIDE the request transaction. That is the whole point: the state
 * change and the notification commit together or not at all, which is what
 * makes Rule 8 true.
 *
 * @param {object} input
 * @param {number} input.requestId
 * @param {SmsEvent} input.event
 * @param {string} input.recipient Raw or normalized contact number.
 * @param {string} input.message Rendered by `renderTemplate`.
 * @param {number} [input.maxAttempts]
 * @returns {{request_id: number, event: SmsEvent, recipient: string, message: string, status: OutboxStatus, attempts: number, max_attempts: number}}
 * @throws {import('../utils/phone.js').PhoneNormalizationError} When the recipient is unusable.
 */
export function queueEventForRequest(input, maxAttempts = 5) {
  const recipient = normalizePhone(input.recipient);
  return /** @type {any} */ (buildOutboxInsert({ ...input, recipient }, maxAttempts));
}

/**
 * Throttle for the running process, resolved from the environment.
 *
 * The outbox owns this. Callers must not throttle themselves, and must not
 * assume a rate.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function resolveConfiguredThrottle(env = process.env) {
  return resolveThrottlePerMinute(env.SMS_THROTTLE_PER_MINUTE);
}