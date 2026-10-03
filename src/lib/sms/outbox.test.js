import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveThrottlePerMinute,
  computeBackoffMs,
  decideAfterAttempt,
  selectDueRows,
  DEVICE_THROTTLE_CEILING_PER_MINUTE,
} from './outbox.js';

/** @type {any} */
const row = (overrides = {}) => ({
  id: 1,
  requestId: 1,
  event: 'submitted',
  recipient: '+639171234567',
  message: 'test',
  status: 'queued',
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: null,
  ...overrides,
});

describe('resolveThrottlePerMinute', () => {
  test('uses a sane default when unset or nonsense', () => {
    assert.equal(resolveThrottlePerMinute(undefined), 12);
    assert.equal(resolveThrottlePerMinute(''), 12);
    assert.equal(resolveThrottlePerMinute('abc'), 12);
    assert.equal(resolveThrottlePerMinute('0'), 12);
    assert.equal(resolveThrottlePerMinute('-5'), 12);
  });

  test('honours a configured rate below the ceiling', () => {
    assert.equal(resolveThrottlePerMinute('8'), 8);
  });

  test('never exceeds what one TextBee phone can sustain', () => {
    assert.equal(resolveThrottlePerMinute('500'), DEVICE_THROTTLE_CEILING_PER_MINUTE);
  });
});

describe('computeBackoffMs', () => {
  test('grows with each attempt', () => {
    const first = computeBackoffMs(1);
    const second = computeBackoffMs(2);
    const third = computeBackoffMs(3);
    assert.ok(second > first);
    assert.ok(third > second);
  });

  test('caps rather than growing without bound', () => {
    assert.ok(computeBackoffMs(50) <= 30 * 60_000);
  });
});

describe('decideAfterAttempt', () => {
  test('an accepted send stops at sent, never delivered', () => {
    // TextBee 200 means accepted. Delivery is only ever known via webhook.
    const decision = decideAfterAttempt(row(), { accepted: true, outcome: 'accepted', retryable: false });
    assert.equal(decision.status, 'sent');
    assert.equal(decision.recordBatchId, true);
    assert.equal(decision.terminal, true);
  });

  test('a 401 is never retried, however many attempts remain', () => {
    const decision = decideAfterAttempt(row({ attempts: 0 }), {
      accepted: false,
      outcome: 'unauthorized',
      retryable: false,
    });
    assert.equal(decision.status, 'failed');
    assert.equal(decision.retryAt, null);
    assert.equal(decision.terminal, true);
  });

  test('a 429 is rescheduled with a backoff', () => {
    const nowMs = Date.parse('2026-10-03T00:00:00.000Z');
    const decision = decideAfterAttempt(row(), { accepted: false, outcome: 'rate_limited', retryable: true }, { nowMs });
    assert.equal(decision.status, 'queued');
    assert.ok(decision.retryAt);
    assert.ok(Date.parse(decision.retryAt) > nowMs);
    assert.equal(decision.terminal, false);
  });

  test('gives up once maxAttempts is reached', () => {
    const decision = decideAfterAttempt(row({ attempts: 4, maxAttempts: 5 }), {
      accepted: false,
      outcome: 'gateway_error',
      retryable: true,
    });
    assert.equal(decision.status, 'failed');
    assert.equal(decision.retryAt, null);
  });

  test('a rejected-but-retryable request still stops at maxAttempts', () => {
    const decision = decideAfterAttempt(row({ attempts: 2, maxAttempts: 3 }), {
      accepted: false,
      outcome: 'rejected',
      retryable: true,
    });
    assert.equal(decision.status, 'failed');
  });
});

describe('selectDueRows', () => {
  const now = Date.parse('2026-10-03T00:00:00.000Z');

  test('skips a row whose backoff has not elapsed', () => {
    const rows = [row({ nextAttemptAt: '2026-10-03T00:05:00.000Z' })];
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 10 }).length, 0);
  });

  test('selects a row whose backoff has elapsed', () => {
    const rows = [row({ nextAttemptAt: '2026-09-30T00:00:00.000Z' })];
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 10 }).length, 1);
  });

  test('skips a row that has exhausted its attempts', () => {
    const rows = [row({ attempts: 5, maxAttempts: 5 })];
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 10 }).length, 0);
  });

  test('never exceeds the per-minute allowance', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: i + 1 }));
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 5 }).length, 5);
  });

  test('never exceeds batchSize even when the rate allows more', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: i + 1 }));
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 60, batchSize: 3 }).length, 3);
  });

  test('ignores terminal rows', () => {
    const rows = [row({ status: 'sent' }), row({ status: 'delivered' }), row({ status: 'failed' })];
    assert.equal(selectDueRows(rows, { nowMs: now, perMinute: 10 }).length, 0);
  });

  test('leaves a freshly claimed row alone', () => {
    const inFlight = [row({ status: 'sending', claimedAt: new Date(now).toISOString() })];
    assert.equal(
      selectDueRows(inFlight, { nowMs: now, perMinute: 10, sendingStaleAfterMs: 120_000 }).length,
      0,
      'a second worker must not re-send a row another worker is still holding',
    );
  });

  test('reclaims a row stuck in sending once its claim is stale', () => {
    const stuck = [row({ status: 'sending', claimedAt: new Date(now).toISOString() })];
    assert.equal(
      selectDueRows(stuck, { nowMs: now + 200_000, perMinute: 10, sendingStaleAfterMs: 120_000 }).length,
      1,
    );
  });

  test('reclaims an orphaned row with no claim timestamp at all', () => {
    const orphaned = [row({ status: 'sending', claimedAt: null })];
    assert.equal(selectDueRows(orphaned, { nowMs: now, perMinute: 10 }).length, 1);
  });
});