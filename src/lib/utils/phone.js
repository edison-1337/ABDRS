/**
 * Philippine mobile number normalization.
 *
 * The single reason this module exists: TextBee requires recipients in E.164
 * form with a country code, while barangay residents supply whatever is on
 * their ID -- "09171234567", "+639171234567", "63 917 123 4567", or a landline.
 * A number that survives a string concat and reaches the gateway is a silent
 * delivery failure, so normalization happens here and nowhere else.
 *
 * Pure and side-effect free. No I/O, no environment access.
 */

/** The only country code this system supports. */
export const DEFAULT_COUNTRY_CODE = '+63';

/**
 * Mobile prefixes in the Philippine numbering plan. Kept as data rather than a
 * regex so the set is auditable and easy to extend.
 */
const MOBILE_PREFIXES = ['8', '9'];

/**
 * Length of a normalized local mobile number, WITHOUT the country code and
 * WITHOUT the leading zero.
 *
 * `09171234567` is 11 digits including the `0`; once that is stripped it is 10.
 * Getting this wrong rejects every valid number, which is why it is a named
 * constant rather than an inline literal.
 */
const MOBILE_LOCAL_LENGTH = 10;

/**
 * Length of a local landline number without the leading zero: `2` plus eight
 * digits, as in `0281234567`. One digit shorter than a mobile, which is what
 * keeps the two from being confused after normalization.
 */
const LANDLINE_LOCAL_LENGTH = 9;

/**
 * TextBee rejects a recipient it cannot route. Longest Philippine mobile number
 * with country code: `+63` then 10 local digits.
 */
const E164_MAX_LENGTH = 14;

export class PhoneNormalizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PhoneNormalizationError';
  }
}

/**
 * Strips formatting characters a human might type or paste.
 *
 * Keeps digits and a single leading `+`, which is the only meaningful prefix
 * signal. Extensions, spaces, dashes, dots, and parentheses are noise.
 */
function stripFormatting(value) {
  const trimmed = String(value ?? '').trim();
  const hasExplicitPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasExplicitPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * Normalizes any accepted Philippine input to E.164.
 *
 * Accepts:
 *   09171234567      local mobile, leading zero
 *   9171234567       local mobile, leading zero omitted
 *   +639171234567    already international
 *   639171234567     international, plus omitted
 *   0917 123 4567    spaced or dashed
 *
 * @param {string} value Raw input from a form field.
 * @param {object} [options]
 * @param {boolean} [options.allowLandline=false] Accept a ten-digit landline
 *   such as `0281234567` by mapping it into the `+63` landline range. Off by
 *   default: an SMS gateway will not reach a landline.
 * @returns {string} E.164 form, for example `+639171234567`.
 * @throws {PhoneNormalizationError} When the input is not a usable number.
 */
export function normalizePhone(value, options = {}) {
  const { allowLandline = false } = options;
  const stripped = stripFormatting(value);

  if (!stripped || stripped === '+') {
    throw new PhoneNormalizationError('A mobile number is required.');
  }

  let digits = stripped.startsWith('+') ? stripped.slice(1) : stripped;

  // International without a plus: strip the 63 country code.
  if (digits.startsWith('63') && digits.length > MOBILE_LOCAL_LENGTH) {
    digits = digits.slice(2);
  }

  // Local with the customary leading zero.
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Some entries carry 63 after the local zero was already stripped, e.g. 63917...
  if (digits.startsWith('63') && digits.length > MOBILE_LOCAL_LENGTH) {
    digits = digits.slice(2);
  }

  if (!/^\d+$/.test(digits)) {
    throw new PhoneNormalizationError('A mobile number must contain digits only.');
  }

  if (digits.length === LANDLINE_LOCAL_LENGTH && digits.startsWith('2')) {
    if (!allowLandline) {
      throw new PhoneNormalizationError('Landline numbers are not accepted for SMS.');
    }
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  if (digits.length !== MOBILE_LOCAL_LENGTH || !MOBILE_PREFIXES.includes(digits[0])) {
    throw new PhoneNormalizationError('Enter a valid Philippine mobile number.');
  }

  const e164 = `${DEFAULT_COUNTRY_CODE}${digits}`;
  if (e164.length > E164_MAX_LENGTH) {
    throw new PhoneNormalizationError('Enter a valid Philippine mobile number.');
  }

  return e164;
}

/**
 * Non-throwing variant for form re-display and search fields.
 *
 * @param {string} value Raw input.
 * @returns {string|null} E.164 form, or `null` when the input is unusable.
 */
export function tryNormalizePhone(value) {
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

/**
 * Masks a number for display in a staff interface or a log line.
 *
 * Used wherever a number is shown but does not need to be readable in full, so
 * the obvious places never carry a complete contact number.
 *
 * @param {string} value Raw or already-normalized number.
 * @returns {string} For example `+63••••••4567`, or `''` when unusable.
 */
export function maskPhone(value) {
  const normalized = tryNormalizePhone(value);
  if (!normalized) return '';
  return `${normalized.slice(0, 3)}••••••${normalized.slice(-4)}`;
}

/**
 * Compares two numbers for identity without leaking either one.
 *
 * Useful for "is this the same phone as the verified one" checks in a log line.
 *
 * @param {string} a Raw or normalized number.
 * @param {string} b Raw or normalized number.
 * @returns {boolean}
 */
export function samePhone(a, b) {
  const left = tryNormalizePhone(a);
  const right = tryNormalizePhone(b);
  return left !== null && right !== null && left === right;
}