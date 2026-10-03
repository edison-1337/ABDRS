/**
 * Webhook authenticity.
 *
 * TextBee signs each delivery callback with HMAC-SHA256 over the RAW request
 * body and sends the digest in the `X-Signature` header. The raw bytes are the
 * signed material, which is why the route must capture the body before any JSON
 * parsing: `JSON.stringify(JSON.parse(raw))` is not byte-identical to `raw`, and
 * verifying against a re-serialized body silently accepts nothing while
 * appearing to work.
 *
 * Two things are enforced here, and both matter:
 *
 *   1. SIGNATURE -- an unsigned or wrongly signed payload may never change a
 *      message status. Without this, anyone who can reach the endpoint could
 *      mark arbitrary messages as delivered.
 *   2. IDEMPOTENCY -- TextBee retries a callback until it gets a 200, so the same
 *      `idempotencyKey` arrives repeatedly. Applying it twice would double-count
 *      deliveries and re-send notifications.
 *
 * Uses `timingSafeEqual` rather than `===`, so a wrong signature cannot be
 * discovered one byte at a time.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header TextBee signs with. */
export const SIGNATURE_HEADER = 'x-signature';

/** Accepted signature encodings. */
const ENCODINGS = /** @type {const} */ (['hex', 'base64']);

/**
 * Computes the expected signature for a raw body.
 *
 * @param {string|Buffer} rawBody The exact bytes received.
 * @param {string} secret Shared webhook secret.
 * @param {'hex'|'base64'} [encoding='hex']
 * @returns {string}
 */
export function computeWebhookSignature(rawBody, secret, encoding = 'hex') {
  if (!secret) throw new Error('TEXTBEE_WEBHOOK_SECRET is required to verify webhooks.');
  const digest = createHmac('sha256', secret).update(rawBody).digest();
  return ENCODINGS.includes(encoding) ? digest.toString(encoding) : digest.toString('hex');
}

/**
 * Constant-time comparison of a presented signature against the expected one.
 *
 * @param {unknown} presented Value from the header.
 * @param {string} expected
 * @returns {boolean}
 */
function signaturesMatch(presented, expected) {
  if (typeof presented !== 'string' || presented.length === 0) return false;

  const attempts = [
    { presented, expected },
    { presented: presented.replace(/^sha256=/i, ''), expected },
  ];

  for (const attempt of attempts) {
    const a = Buffer.from(attempt.expected);
    const b = Buffer.from(attempt.presented);
    if (a.length !== b.length) continue;
    if (timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * @typedef {object} VerifyResult
 * @property {boolean} valid Whether the payload may be acted on.
 * @property {string} [reason] Why not. Never discloses the expected digest.
 * @property {boolean} [alreadyProcessed] A verified payload whose idempotency key
 *   has already been applied. Answer 200 and stop.
 */

/**
 * Verifies an inbound delivery callback.
 *
 * @param {object} input
 * @param {string|Buffer} input.rawBody Exact bytes, before any parsing.
 * @param {string|undefined} input.signature Value of the `X-Signature` header.
 * @param {string} input.secret Shared secret.
 * @param {(key: string) => Promise<boolean>|boolean} [input.hasProcessed]
 *   Idempotency check. Omit only where the caller has no dedupe store, which is
 *   not the case for the SMS delivery route.
 * @param {string} [input.idempotencyKey] Value from the payload, read only after
 *   the signature is verified.
 * @returns {Promise<VerifyResult>}
 */
export async function verifyWebhookSignature(input) {
  const { rawBody, signature, secret, hasProcessed, idempotencyKey } = input;

  if (!secret) {
    // Refusing to accept is the safe default. An unset secret must never mean
    // "skip verification".
    return { valid: false, reason: 'webhook_not_configured' };
  }
  if (rawBody === undefined || rawBody === null || rawBody.length === 0) {
    return { valid: false, reason: 'empty_body' };
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    return { valid: false, reason: 'missing_signature' };
  }

  const expectedHex = computeWebhookSignature(rawBody, secret, 'hex');
  const expectedBase64 = computeWebhookSignature(rawBody, secret, 'base64');

  if (!signaturesMatch(signature, expectedHex) && !signaturesMatch(signature, expectedBase64)) {
    // Deliberately vague: confirming which part was wrong would help an attacker.
    return { valid: false, reason: 'signature_mismatch' };
  }

  if (typeof hasProcessed === 'function' && idempotencyKey) {
    if (await hasProcessed(idempotencyKey)) {
      return { valid: true, alreadyProcessed: true };
    }
  }

  return { valid: true };
}

/**
 * Extracts the idempotency key from a verified payload.
 *
 * Only ever call this on an already-verified payload. The key is attacker
 * controlled until the signature has been checked, so reading it earlier and
 * using it for a dedupe lookup would let a forger suppress real receipts.
 *
 * @param {Record<string, unknown>} payload
 * @returns {string|null}
 */
export function readIdempotencyKey(payload) {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = /** @type {Record<string, unknown>} */ (payload).idempotencyKey;
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  return candidate.slice(0, 128);
}