import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePhone,
  tryNormalizePhone,
  maskPhone,
  samePhone,
  PhoneNormalizationError,
} from './phone.js';

describe('normalizePhone', () => {
  test('accepts a local mobile number with the leading zero', () => {
    assert.equal(normalizePhone('09171234567'), '+639171234567');
  });

  test('accepts a local mobile number with the leading zero omitted', () => {
    assert.equal(normalizePhone('9171234567'), '+639171234567');
  });

  test('accepts an international number with a plus', () => {
    assert.equal(normalizePhone('+639171234567'), '+639171234567');
  });

  test('accepts an international number without a plus', () => {
    assert.equal(normalizePhone('639171234567'), '+639171234567');
  });

  test('ignores spaces, dashes, dots, and parentheses', () => {
    assert.equal(normalizePhone('+63 (917) 123-4567'), '+639171234567');
    assert.equal(normalizePhone('0917.123.4567'), '+639171234567');
    assert.equal(normalizePhone('  0917 123 4567  '), '+639171234567');
  });

  test('handles a 63 that follows a stripped leading zero', () => {
    // "0" then "63..." is a real way numbers arrive from spreadsheets.
    assert.equal(normalizePhone('0639171234567'), '+639171234567');
  });

  test('rejects an empty value', () => {
    assert.throws(() => normalizePhone(''), PhoneNormalizationError);
    assert.throws(() => normalizePhone('   '), PhoneNormalizationError);
    assert.throws(() => normalizePhone(null), PhoneNormalizationError);
    assert.throws(() => normalizePhone(undefined), PhoneNormalizationError);
  });

  test('rejects a number that is too short', () => {
    assert.throws(() => normalizePhone('0917123'), PhoneNormalizationError);
  });

  test('rejects a number that is too long', () => {
    assert.throws(() => normalizePhone('091712345678999'), PhoneNormalizationError);
  });

  test('rejects a mobile number whose prefix is not 8 or 9', () => {
    // 7 is not a Philippine mobile prefix.
    assert.throws(() => normalizePhone('07171234567'), PhoneNormalizationError);
  });

  test('rejects a landline by default', () => {
    assert.throws(() => normalizePhone('0281234567'), PhoneNormalizationError);
  });

  test('accepts a landline only when explicitly allowed', () => {
    assert.throws(() => normalizePhone('0281234567'), PhoneNormalizationError);
    assert.equal(normalizePhone('0281234567', { allowLandline: true }), '+63281234567');
  });

  test('does not confuse a landline with a mobile', () => {
    // A landline is one digit shorter once the leading zero is stripped, so the
    // two can never be normalized to the same value.
    const mobile = normalizePhone('09171234567');
    const landline = normalizePhone('0281234567', { allowLandline: true });
    assert.notEqual(mobile, landline);
  });

  test('produces output TextBee will accept as E.164', () => {
    const result = normalizePhone('09171234567');
    assert.match(result, /^\+[1-9]\d{7,14}$/);
  });
});

describe('tryNormalizePhone', () => {
  test('returns the normalized form for usable input', () => {
    assert.equal(tryNormalizePhone('09171234567'), '+639171234567');
  });

  test('returns null instead of throwing for unusable input', () => {
    assert.equal(tryNormalizePhone('nonsense'), null);
    assert.equal(tryNormalizePhone(''), null);
  });
});

describe('maskPhone', () => {
  test('keeps the country code and the last four digits only', () => {
    assert.equal(maskPhone('09171234567'), '+63••••••4567');
  });

  test('is idempotent on an already normalized number', () => {
    assert.equal(maskPhone('+639171234567'), '+63••••••4567');
  });

  test('returns an empty string for unusable input', () => {
    assert.equal(maskPhone('nonsense'), '');
  });
});

describe('samePhone', () => {
  test('matches equivalent representations', () => {
    assert.equal(samePhone('09171234567', '+639171234567'), true);
    assert.equal(samePhone('0917 123 4567', '9171234567'), true);
  });

  test('does not match different numbers', () => {
    assert.equal(samePhone('09171234567', '09181234567'), false);
  });

  test('does not match when either side is unusable', () => {
    assert.equal(samePhone('09171234567', 'nonsense'), false);
    assert.equal(samePhone(null, null), false);
  });
});