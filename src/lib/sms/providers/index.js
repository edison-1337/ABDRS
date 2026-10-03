/**
 * The SMS provider contract and the provider registry.
 *
 * A provider is the only thing in this repository that performs network I/O for
 * notifications. Callers depend on this contract, never on TextBee's shape, so
 * swapping or adding a gateway is one new file in `./providers/` plus a branch
 * in `createSmsProvider`.
 *
 * @typedef {'submitted'|'under_review'|'approved'|'released'|'rejected'|'cancelled'} SmsEvent
 * @typedef {'queued'|'sending'|'sent'|'delivered'|'failed'} OutboxStatus
 *
 * @typedef {object} SmsSendResult
 * @property {boolean} accepted The gateway accepted the message for sending.
 *   This is NOT delivery.
 * @property {string|null} batchId Gateway batch id, kept to follow delivery.
 * @property {string} outcome Normalized outcome, independent of provider.
 * @property {boolean} retryable Whether another attempt could succeed.
 * @property {string} provider Provider name, for logs.
 * @property {number} [gatewayStatus] Raw provider HTTP status, for logs.
 * @property {string} [reason] Safe provider reason, for logs. Never for clients.
 *
 * @typedef {object} SmsProvider
 * @property {string} name
 * @property {(input: {to: string, message: string}) => Promise<SmsSendResult>} send
 */

import { createTextbeeProvider } from './textbee.js';
import { createMockProvider } from './mock.js';

export { createTextbeeProvider } from './textbee.js';
export { createMockProvider } from './mock.js';

/** Provider names this registry can build. */
export const SUPPORTED_PROVIDERS = /** @type {const} */ (['textbee', 'mock']);

/**
 * Builds the configured provider.
 *
 * `SMS_PROVIDER` selects it. Anything other than `textbee` falls back to `mock`
 * rather than throwing, so a typo in a deployment variable degrades to
 * "nothing is sent" instead of taking down the whole server. That trade is
 * deliberate: the alternative is a crash loop where a citizen cannot file a
 * request at all.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {SmsProvider}
 */
export function createSmsProvider(env = process.env) {
  const selected = String(env.SMS_PROVIDER ?? 'mock').trim().toLowerCase();

  if (selected === 'textbee') {
    return createTextbeeProvider({
      apiKey: env.TEXTBEE_API_KEY,
      baseUrl: env.TEXTBEE_BASE_URL,
      deviceId: env.TEXTBEE_DEVICE_ID || undefined,
      simSubscriptionId: env.TEXTBEE_SIM_SUBSCRIPTION_ID
        ? Number.parseInt(env.TEXTBEE_SIM_SUBSCRIPTION_ID, 10)
        : undefined,
    });
  }

  return createMockProvider();
}

/**
 * True when the selected provider can actually reach a real handset.
 *
 * The SMS log and the settings screen use this to label the environment
 * honestly, so a deployment that is quietly running on `mock` is visible rather
 * than assumed to be live.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
export function isLiveProvider(env = process.env) {
  return String(env.SMS_PROVIDER ?? 'mock').trim().toLowerCase() === 'textbee';
}