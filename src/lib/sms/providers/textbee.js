/**
 * TextBee SMS API adapter.
 *
 * TextBee turns an Android phone with a SIM into an SMS gateway. Three
 * properties of that gateway shape this file:
 *
 *   1. The API key grants FULL account access -- it can send SMS, read every
 *      message, and rewrite webhooks. It is read from the environment, held in a
 *      closure, never logged, never returned, and never placed on `outgoing`.
 *   2. `200` means ACCEPTED, not delivered. The message went into a queue and a
 *      push was sent to the phone. Delivery is only ever known through a signed
 *      webhook. This adapter therefore reports `accepted` and stops there.
 *   3. Status codes are not interchangeable:
 *        200 accepted              -> no retry, awaiting receipt
 *        400 request or device     -> do NOT retry; it will fail identically
 *        401 key missing/revoked   -> NEVER retry; the same key fails again
 *        429 plan or batch limit   -> retry, after a pause
 *
 * The adapter's whole job is to translate those into the provider contract.
 * It does not decide retry timing or throttling -- `outbox.js` owns that.
 */

/** @typedef {import('../index.js').SmsProvider} SmsProvider */

const DEFAULT_BASE_URL = 'https://api.textbee.dev/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Gateway outcome codes mapped to a retry decision.
 *
 * `retryable` is the only thing this adapter decides about failure. Whether and
 * when to act on it belongs to the outbox.
 *
 * @type {Readonly<Record<string, {outcome: string, retryable: boolean}>>}
 */
const GATEWAY_STATUS = {
  200: { outcome: 'accepted', retryable: false },
  400: { outcome: 'rejected', retryable: false },
  401: { outcome: 'unauthorized', retryable: false },
  403: { outcome: 'unauthorized', retryable: false },
  404: { outcome: 'rejected', retryable: false },
  429: { outcome: 'rate_limited', retryable: true },
};

/** 5xx is retryable. Everything unlisted is treated as a fault and retried once. */
function classifyStatus(status) {
  const mapped = GATEWAY_STATUS[status];
  if (mapped) return mapped;
  if (status >= 500) return { outcome: 'gateway_error', retryable: true };
  return { outcome: 'rejected', retryable: false };
}

/**
 * Extracts a safe, short reason from a gateway error body.
 *
 * The body is the gateway's own message about OUR request, so it is safe to
 * keep in our logs -- but it is returned to the outbox, never to a resident.
 *
 * @param {unknown} body Parsed JSON, or text.
 * @returns {string}
 */
function readGatewayMessage(body) {
  if (typeof body === 'string' && body.trim().length > 0) return body.trim().slice(0, 300);
  if (typeof body === 'object' && body !== null) {
    const record = /** @type {Record<string, unknown>} */ (body);
    for (const field of ['message', 'error', 'detail']) {
      const value = record[field];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim().slice(0, 300);
    }
  }
  return 'No detail returned by the gateway.';
}

/**
 * @param {string} recipient E.164 form. Normalized by `utils/phone.js` upstream.
 * @returns {string}
 */
function assertRecipient(recipient) {
  if (typeof recipient !== 'string' || !/^\+[1-9]\d{7,14}$/.test(recipient)) {
    throw new TypeError('Recipient must be E.164 with a country code.');
  }
  return recipient;
}

/**
 * Builds the TextBee provider.
 *
 * The API key is read once, at construction, and closed over. It is never
 * attached to the returned object, so no caller and no log line can reach it.
 *
 * @param {object} config
 * @param {string} config.apiKey TextBee API key. Required unless `dryRun`.
 * @param {string} [config.baseUrl] Overridable for self-hosted instances.
 * @param {string} [config.deviceId] Force a specific phone. Omit to let TextBee choose.
 * @param {number} [config.simSubscriptionId] SIM selector on a dual-SIM phone.
 * @param {number} [config.timeoutMs]
 * @param {typeof fetch} [config.fetchImpl] Injection point for tests.
 * @param {boolean} [config.dryRun] Build and validate the request, send nothing.
 * @returns {SmsProvider}
 */
export function createTextbeeProvider(config) {
  const {
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    deviceId,
    simSubscriptionId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    dryRun = false,
  } = config ?? {};

  if (!dryRun && (typeof apiKey !== 'string' || apiKey.trim().length === 0)) {
    throw new Error('TEXTBEE_API_KEY is required when SMS_PROVIDER is "textbee".');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for the TextBee provider.');
  }

  const sendUrl = `${baseUrl.replace(/\/+$/, '')}/gateway/send-sms`;

  return {
    name: 'textbee',

    /**
     * Sends one message to one recipient.
     *
     * @param {{to: string, message: string}} input
     * @returns {Promise<import('../index.js').SmsSendResult>}
     */
    async send({ to, message }) {
      assertRecipient(to);
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new TypeError('Message body must be a non-empty string.');
      }

      /** @type {Record<string, unknown>} */
      const payload = { recipients: [to], message };
      if (deviceId) payload.deviceId = deviceId;
      if (typeof simSubscriptionId === 'number') payload.simSubscriptionId = simSubscriptionId;

      if (dryRun) {
        return { accepted: true, batchId: null, outcome: 'accepted', retryable: false, provider: 'textbee' };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(sendUrl, {
          method: 'POST',
          headers: {
            'x-api-key': /** @type {string} */ (apiKey),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const raw = await response.text();
        let parsed = raw;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          // A non-JSON body is still useful as a reason string.
        }

        if (!response.ok) {
          const { outcome, retryable } = classifyStatus(response.status);
          return {
            accepted: false,
            batchId: null,
            outcome,
            retryable,
            provider: 'textbee',
            gatewayStatus: response.status,
            // Safe to log: the gateway describing our own request. Never
            // includes the key, and is never returned to a resident.
            reason: readGatewayMessage(parsed),
          };
        }

        const record = typeof parsed === 'object' && parsed !== null ? /** @type {any} */ (parsed) : {};
        return {
          accepted: true,
          // Keep it: this is how delivery is followed.
          batchId: record.smsBatchId ?? record.batchId ?? null,
          outcome: 'accepted',
          retryable: false,
          provider: 'textbee',
          gatewayStatus: response.status,
        };
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        return {
          accepted: false,
          batchId: null,
          outcome: aborted ? 'timeout' : 'network_error',
          // A timeout or a dropped connection is worth one more attempt.
          retryable: true,
          provider: 'textbee',
          reason: aborted ? 'The gateway did not respond in time.' : 'The gateway could not be reached.',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}