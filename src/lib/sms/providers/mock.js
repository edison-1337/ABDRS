/**
 * Development provider. Sends nothing.
 *
 * This is the correct provider for local development and for every automated
 * test: `SMS_PROVIDER=mock` must mean no gateway credential is needed, no
 * network call is made, and a developer cannot accidentally text a real
 * resident while iterating on a form.
 *
 * It reports the same `accepted: true` a real gateway would, so the outbox path
 * -- queueing, throttling, retry, webhook handling -- is exercised identically
 * in both modes. Only the transport is absent.
 */

import { randomUUID } from 'node:crypto';

/** @typedef {import('./index.js').SmsProvider} SmsProvider */
/** @typedef {import('./index.js').SmsSendResult} SmsSendResult */

/**
 * @param {object} [options]
 * @param {boolean} [options.failFirst=false] Force a retryable failure, so the
 *   backoff and retry path can be exercised without a gateway.
 * @param {boolean} [options.failPermanent=false] Force a non-retryable failure.
 * @param {string[]} [options.sink] Collects `{to, message}` pairs for assertions.
 *   Messages are never logged; a test may inspect them, production may not.
 * @returns {SmsProvider}
 */
export function createMockProvider(options = {}) {
  const { failFirst = false, failPermanent = false, sink } = options;
  let calls = 0;

  return {
    name: 'mock',

    /**
     * @param {{to: string, message: string}} input
     * @returns {Promise<SmsSendResult>}
     */
    async send({ to, message }) {
      if (typeof to !== 'string' || !/^\+[1-9]\d{7,14}$/.test(to)) {
        throw new TypeError('Recipient must be E.164 with a country code.');
      }
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new TypeError('Message body must be a non-empty string.');
      }

      calls += 1;

      if (failPermanent) {
        return {
          accepted: false,
          batchId: null,
          outcome: 'unauthorized',
          retryable: false,
          provider: 'mock',
          reason: 'Mock provider is configured to fail permanently.',
        };
      }

      if (failFirst && calls === 1) {
        return {
          accepted: false,
          batchId: null,
          outcome: 'rate_limited',
          retryable: true,
          provider: 'mock',
          reason: 'Mock provider is configured to fail the first attempt.',
        };
      }

      sink?.push({ to, message });

      return {
        accepted: true,
        batchId: `mock-${randomUUID()}`,
        outcome: 'accepted',
        retryable: false,
        provider: 'mock',
      };
    },
  };
}