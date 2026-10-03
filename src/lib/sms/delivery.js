/**
 * Gateway status -> internal status.
 *
 * TextBee's vocabulary and ours do not line up, and conflating them is how a
 * system ends up telling a resident their document is ready when the message was
 * only accepted.
 *
 * The distinction this module exists to hold:
 *
 *   accepted  the gateway queued the message and pushed it to the phone.
 *             NOT delivered. The handset may be offline, out of credit, or the
 *             SIM may have failed.
 *   delivered the carrier confirmed receipt. Only a SIGNED webhook says this.
 *
 * So an outbox row starts at `queued`, becomes `sent` when the gateway accepts,
 * and only a verified webhook may move it to `delivered`.
 */

/**
 * @typedef {import('./providers/index.js').OutboxStatus} OutboxStatus
 * @typedef {import('./providers/index.js').SmsSendResult} SmsSendResult
 */

/** Terminal statuses. Nothing follows them. */
export const TERMINAL_OUTBOX_STATUSES = /** @type {const} */ (['sent', 'delivered', 'failed']);

/** Normalized send outcomes, provider independent. */
export const SEND_OUTCOMES = /** @type {const} */ ([
  'accepted',
  'rejected',
  'unauthorized',
  'rate_limited',
  'gateway_error',
  'network_error',
  'timeout',
]);

/**
 * @param {OutboxStatus} status
 * @returns {boolean}
 */
export function isTerminalOutboxStatus(status) {
  return /** @type {readonly string[]} */ (TERMINAL_OUTBOX_STATUSES).includes(status);
}

/**
 * Whether a send outcome should be retried.
 *
 * Note what is NOT retryable: `unauthorized`. A revoked or mistyped API key
 * fails identically on every attempt, and retrying it five times just delays the
 * operator noticing the key is wrong.
 *
 * @param {SmsSendResult} result
 * @returns {boolean}
 */
export function shouldRetrySend(result) {
  if (result.accepted) return false;
  return result.retryable === true && result.outcome !== 'unauthorized';
}

/**
 * Maps a send result to the status the outbox row should take.
 *
 * @param {SmsSendResult} result
 * @param {{attempts: number, maxAttempts: number}} context
 * @returns {OutboxStatus}
 */
export function mapSendResultToStatus(result, context) {
  if (result.accepted) return 'sent';
  if (!shouldRetrySend(result)) return 'failed';
  return context.attempts >= context.maxAttempts ? 'failed' : 'queued';
}

/**
 * TextBee delivery-receipt statuses, mapped to ours.
 *
 * Anything unmapped is deliberately NOT treated as delivered. An unrecognised
 * status is reported as `unknown` so the row can be reconciled by hand, rather
 * than silently marked successful.
 *
 * @type {Readonly<Record<string, OutboxStatus>>}
 */
const RECEIPT_STATUS = {
  queued: 'queued',
  pending: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  success: 'delivered',
  failed: 'failed',
  undelivered: 'failed',
  rejected: 'failed',
  expired: 'failed',
};

/**
 * @param {unknown} gatewayStatus Status string from a verified receipt.
 * @returns {OutboxStatus|null} `null` when the status is not recognised.
 */
export function mapGatewayStatus(gatewayStatus) {
  if (typeof gatewayStatus !== 'string') return null;
  return /** @type {Record<string, OutboxStatus>} */ (RECEIPT_STATUS)[gatewayStatus.trim().toLowerCase()] ?? null;
}

/**
 * Decides the row's next status from a verified receipt.
 *
 * Only ever call this on a payload whose signature has already been verified.
 *
 * @param {Object} input
 * @param {import('./providers/index.js').OutboxStatus} input.current
 * @param {unknown} input.gatewayStatus
 * @returns {{status: OutboxStatus, changed: boolean, reason?: string}}
 */
export function applyDeliveryReceipt(input) {
  const mapped = mapGatewayStatus(input.gatewayStatus);

  if (mapped === null) {
    // Keep the current status; never guess.
    return { status: input.current, changed: false, reason: 'unrecognised_gateway_status' };
  }
  if (mapped === input.current) {
    return { status: input.current, changed: false };
  }

  // A receipt can advance a message, never walk one backwards. A late `sent`
  // after a confirmed `delivered` is stale, not a regression.
  const order = /** @type {const} */ ({ queued: 0, sent: 1, delivered: 2, failed: 3 });
  if (mapped === 'sent' && input.current === 'delivered') {
    return { status: input.current, changed: false, reason: 'stale_receipt' };
  }
  if (order[mapped] < order[input.current] && input.current !== 'failed') {
    return { status: input.current, changed: false, reason: 'stale_receipt' };
  }

  return { status: mapped, changed: true };
}

/**
 * Human-readable labels for the SMS log. Owned here so the browser never
 * hardcodes a status name.
 *
 * @type {Readonly<Record<OutboxStatus, string>>}
 */
export const OUTBOX_STATUS_LABELS = /** @type {const} */ ({
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent to gateway',
  delivered: 'Delivered',
  failed: 'Failed',
});