import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  computeWebhookSignature,
  verifyWebhookSignature,
  readIdempotencyKey,
} from './signature.js';

const SECRET = 'test-webhook-secret';
const BODY = JSON.stringify({
  idempotencyKey: 'evt_12345',
  status: 'delivered',
  smsBatchId: 'batch_abc',
  recipient: '+639171234567',
});

describe('computeWebhookSignature', () => {
  test('matches a hand-rolled HMAC of the same bytes', () => {
    const expected = createHmac('sha256', SECRET).update(BODY).digest('hex');
    assert.equal(computeWebhookSignature(BODY, SECRET, 'hex'), expected);
  });

  test('produces a different digest for a different body', () => {
    const a = computeWebhookSignature(BODY, SECRET);
    const b = computeWebhookSignature(`${BODY} `, SECRET);
    assert.notEqual(a, b);
  });

  test('refuses to sign without a secret', () => {
    assert.throws(() => computeWebhookSignature(BODY, ''), /required/);
  });
});

describe('verifyWebhookSignature', () => {
  test('accepts a correctly signed hex payload', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, SECRET, 'hex'),
      secret: SECRET,
    });
    assert.equal(result.valid, true);
    assert.equal(result.alreadyProcessed, undefined);
  });

  test('accepts a correctly signed base64 payload', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, SECRET, 'base64'),
      secret: SECRET,
    });
    assert.equal(result.valid, true);
  });

  test('accepts a sha256= prefixed signature', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: `sha256=${computeWebhookSignature(BODY, SECRET, 'hex')}`,
      secret: SECRET,
    });
    assert.equal(result.valid, true);
  });

  test('refuses a payload signed with the wrong secret', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, 'not-the-secret'),
      secret: SECRET,
    });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'signature_mismatch');
  });

  test('refuses a tampered body even with a valid-looking signature', async () => {
    // The signature is over the original bytes; the body was altered in flight.
    const signature = computeWebhookSignature(BODY, SECRET);
    const result = await verifyWebhookSignature({
      rawBody: BODY.replace('delivered', 'failed'),
      signature,
      secret: SECRET,
    });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'signature_mismatch');
  });

  test('refuses a missing signature header', async () => {
    const result = await verifyWebhookSignature({ rawBody: BODY, signature: undefined, secret: SECRET });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'missing_signature');
  });

  test('refuses an empty body', async () => {
    const result = await verifyWebhookSignature({ rawBody: '', signature: 'abc', secret: SECRET });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'empty_body');
  });

  test('refuses everything when no secret is configured', async () => {
    // An unset secret must mean "reject", never "skip verification".
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: 'anything',
      secret: '',
    });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'webhook_not_configured');
  });

  test('flags a replayed payload as already processed', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, SECRET),
      secret: SECRET,
      idempotencyKey: 'evt_12345',
      hasProcessed: async (key) => key === 'evt_12345',
    });
    assert.equal(result.valid, true);
    assert.equal(result.alreadyProcessed, true);
  });

  test('does not flag a first-seen payload as processed', async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, SECRET),
      secret: SECRET,
      idempotencyKey: 'evt_99999',
      hasProcessed: async () => false,
    });
    assert.equal(result.valid, true);
    assert.equal(result.alreadyProcessed, undefined);
  });

  test('does not consult the dedupe store before the signature is verified', async () => {
    // A forger must not be able to suppress real receipts by guessing a key.
    let consulted = false;
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signature: computeWebhookSignature(BODY, 'wrong-secret'),
      secret: SECRET,
      idempotencyKey: 'evt_12345',
      hasProcessed: async () => {
        consulted = true;
        return true;
      },
    });
    assert.equal(result.valid, false);
    assert.equal(consulted, false, 'dedupe store must not be consulted for an unverified payload');
  });
});

describe('readIdempotencyKey', () => {
  test('reads a string key', () => {
    assert.equal(readIdempotencyKey({ idempotencyKey: 'evt_1' }), 'evt_1');
  });

  test('returns null for a missing or non-string key', () => {
    assert.equal(readIdempotencyKey({}), null);
    assert.equal(readIdempotencyKey({ idempotencyKey: 42 }), null);
    assert.equal(readIdempotencyKey(null), null);
  });

  test('truncates an absurdly long key', () => {
    const key = 'x'.repeat(500);
    assert.equal(readIdempotencyKey({ idempotencyKey: key })?.length, 128);
  });
});