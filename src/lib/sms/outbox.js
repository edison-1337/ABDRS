/**
 * Outbox shape, throttling, and drain policy.
 *
 * This module exists because of one TextBee constraint: a registered phone
 * sustains roughly 10-15 messages per minute. If a status change called the
 * gateway inline, every approval would compete for the same 10-15 slots, and a
 * burst would return 429 -- turning a gateway limitation into a citizen-facing
 * failure.
 *
 * So a state change and its outbox row commit in the SAME transaction, and this
 * module decides what to send, how fast, and when to give up. Route handlers
 * never call a provider directly.
 *
 * The invariant this protects is Rule 8: an SMS failure never rolls back the
 * request transaction.
 */

/**
 * @typedef {object} OutboxRow
 * @property {number} id
 * @property {number} requestId Owning request.
 * @property {import('./index.js').SmsEvent} event
 * @property {string} recipient E.164.
 * @property {string} message Rendered body.
 * @property {import('./index.js').OutboxStatus} status
 * @property {number} attempts
 * @property {number} maxAttempts
 * @property {string|null} [nextAttemptAt] ISO timestamp.
 * @property {string|null} [claimedAt] ISO timestamp when a worker flipped this
 *   row to `sending`. Null while the row has never been claimed.
 * @property {string|null} [providerBatchId] Gateway batch id, for delivery lookup.
 */

/** @type {Readonly<Record<import('./index.js').OutboxStatus, {terminal: boolean}>>} */
export const OUTBOX_STATUS = /** @type {const} */ ({
  queued: { terminal: false },
  sending: { terminal: false },
  sent: { terminal: true },
  delivered: { terminal: true },
  failed: { terminal: true },
});

/**
 * TextBee's sustained rate for one phone. Used as the default ceiling; callers
 * may lower it but never raise it above the documented device limit.
 */
export const DEVICE_THROTTLE_CEILING_PER_MINUTE = 15;

/**
 * Clamps a configured rate to something the device can actually sustain.
 *
 * @param {unknown} configured Value from the environment.
 * @returns {number} Messages per minute, between 1 and the device ceiling.
 */
export function resolveThrottlePerMinute(configured) {
  const parsed = Number.parseInt(String(configured ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 12;
  return Math.min(parsed, DEVICE_THROTTLE_CEILING_PER_MINUTE);
}

/**
 * Decides which queued rows may be attempted right now.
 *
 * `sending` rows are reclaimed, because a worker that dies mid-send leaves rows
 * stuck in `sending` and without this they would never be retried. Reclamation
 * is measured from `claimedAt`, NOT from the current clock: comparing the clock
 * against itself would mark every in-flight row stale the instant it is claimed,
 * and a second worker would immediately send the same message twice.
 *
 * @param {OutboxRow[]} rows Candidate rows, oldest first.
 * @param {object} options
 * @param {number} options.nowMs
 * @param {number} options.perMinute
 * @param {number} [options.batchSize=10]
 * @param {number} [options.sendingStaleAfterMs=120000]
 * @returns {OutboxRow[]} Rows to attempt this pass.
 */
export function selectDueRows(rows, options) {
  const { nowMs, perMinute, batchSize = 10, sendingStaleAfterMs = 120_000 } = options;

  const eligible = rows.filter((row) => {
    if (row.status === 'sending') {
      // A row with no claim timestamp was orphaned mid-flight: the worker
      // flipped it to `sending` and died before recording when. Reclaim it,
      // because nothing else ever will.
      if (!row.claimedAt) return true;
      const claimedAt = Date.parse(row.claimedAt);
      if (!Number.isFinite(claimedAt)) return true;
      return nowMs >= claimedAt + sendingStaleAfterMs;
    }
    if (row.status !== 'queued') return false;
    if (row.attempts >= row.maxAttempts) return false;
    // Honour a scheduled retry.
    if (row.nextAttemptAt && Date.parse(row.nextAttemptAt) > nowMs) return false;
    return true;
  });

  // The per-minute ceiling, applied against the rows already in flight or
  // finished. A row reclaimed from `sending` counts as an attempt.
  const attemptsThisWindow = rows.filter(
    (row) => row.status === 'sent' || row.status === 'delivered' || row.status === 'sending',
  ).length;

  const allowance = Math.max(0, Math.min(batchSize, perMinute - attemptsThisWindow));
  return eligible.slice(0, allowance);
}

/**
 * Backoff for a failed send.
 *
 * Retryable failures grow the delay. `SMS_MAX_ATTEMPTS` is the hard stop; the
 * outbox never retries forever.
 *
 * @param {number} attempts Attempts already made, starting at 1.
 * @param {number} [baseMs=30000]
 * @returns {number} Milliseconds to wait before the next attempt.
 */
export function computeBackoffMs(attempts, baseMs = 30_000) {
  const cappedExponent = Math.min(Math.max(attempts - 1, 0), 5);
  return Math.min(baseMs * 2 ** cappedExponent, 30 * 60_000);
}

/**
 * The single decision about what happens to a row after one send attempt.
 *
 * Kept separate from the transport so the policy is testable without a network.
 *
 * @param {OutboxRow} row
 * @param {import('./index.js').SmsSendResult} result
 * @param {object} [options]
 * @param {number} [options.baseMs]
 * @param {number} [options.nowMs]
 * @returns {{status: import('./index.js').OutboxStatus, retryAt: string|null, recordBatchId: boolean, terminal: boolean}}
 */
export function decideAfterAttempt(row, result, options = {}) {
  const { baseMs = 30_000, nowMs = Date.now() } = options;

  if (result.accepted) {
    // Accepted is NOT delivered. The row stops here; only a verified webhook
    // may advance it to delivered.
    return { status: 'sent', retryAt: null, recordBatchId: true, terminal: true };
  }

  const attempts = row.attempts + 1;

  if (!result.retryable) {
    // A 401 or a malformed request fails identically forever. Stop immediately
    // rather than burning the remaining attempts.
    return { status: 'failed', retryAt: null, recordBatchId: false, terminal: true };
  }

  if (attempts >= row.maxAttempts) {
    return { status: 'failed', retryAt: null, recordBatchId: false, terminal: true };
  }

  return {
    status: 'queued',
    retryAt: new Date(nowMs + computeBackoffMs(attempts, baseMs)).toISOString(),
    recordBatchId: false,
    terminal: false,
  };
}

/**
 * Builds the outbox insert for a state change.
 *
 * Called INSIDE the request transaction, which is what makes Rule 8 true: if
 * the transaction rolls back, the message was never queued, and if it commits,
 * the message is guaranteed to exist.
 *
 * @param {object} input
 * @param {number} input.requestId
 * @param {import('./index.js').SmsEvent} input.event
 * @param {string} input.recipient E.164.
 * @param {string} input.message
 * @param {number} [input.maxAttempts]
 * @returns {{request_id: number, event: string, recipient: string, message: string, status: string, attempts: number, max_attempts: number}}
 */
export function buildOutboxInsert(input, maxAttempts = 5) {
  return {
    request_id: input.requestId,
    event: input.event,
    recipient: input.recipient,
    message: input.message,
    status: 'queued',
    attempts: 0,
    max_attempts: maxAttempts,
  };
}