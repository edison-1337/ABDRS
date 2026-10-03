/**
 * Control number generation and validation.
 *
 * The control number is what a resident quotes at the counter and types into the
 * public tracking page, so it must be short enough to read aloud over a phone
 * and impossible to guess.
 *
 * Rule 2: a control number is unique and immutable once assigned. Uniqueness is
 * a database constraint; this module only decides the FORMAT and produces a
 * candidate. It has no database access by design -- allocation belongs to the
 * repository, inside the submission transaction.
 */

/** Prefixes every control number. Keeps the number identifiable at the counter. */
export const CONTROL_NUMBER_PREFIX = 'BRGY';

/** Zero-padded sequence width. Six digits is a million requests per year. */
export const SEQUENCE_WIDTH = 6;

/**
 * Shape of a control number: `BRGY-2026-000041`.
 *
 * Anchored and digit-only, so a value that reaches this module from a query
 * string cannot carry anything else through.
 */
export const CONTROL_NUMBER_PATTERN = /^BRGY-(\d{4})-(\d{6})$/;

/**
 * @typedef {object} ControlNumberParts
 * @property {string} prefix
 * @property {number} year
 * @property {number} sequence
 */

/**
 * Renders a control number from its parts.
 *
 * @param {{year: number, sequence: number}} parts
 * @returns {string}
 * @throws {RangeError} When either part is out of range.
 */
export function formatControlNumber(parts) {
  const { year, sequence } = parts;

  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('Control number year is out of range.');
  }
  if (!Number.isInteger(sequence) || sequence < 0 || sequence >= 10 ** SEQUENCE_WIDTH) {
    throw new RangeError('Control number sequence is out of range.');
  }

  return `${CONTROL_NUMBER_PREFIX}-${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`;
}

/**
 * Parses a control number a resident typed or pasted.
 *
 * Tolerant of case and surrounding whitespace, because it arrives from a
 * keyboard, and strict about everything else.
 *
 * @param {unknown} value
 * @returns {ControlNumberParts|null} `null` when the value is not a control number.
 */
export function parseControlNumber(value) {
  if (typeof value !== 'string') return null;
  const match = CONTROL_NUMBER_PATTERN.exec(value.trim().toUpperCase());
  if (!match) return null;
  return { prefix: match[1], year: Number.parseInt(match[2], 10), sequence: Number.parseInt(match[3], 10) };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidControlNumber(value) {
  return parseControlNumber(value) !== null;
}

/**
 * Builds a candidate control number for a new request.
 *
 * `nextSequence` must come from the database inside the submission transaction.
 * It is passed in rather than looked up so this module stays pure and the
 * allocation stays transactional.
 *
 * @param {object} input
 * @param {Date} input.now
 * @param {number} input.nextSequence Zero-based next sequence for the year.
 * @returns {string}
 */
export function buildControlNumber(input) {
  const year = input.now instanceof Date ? input.now.getFullYear() : Number.NaN;
  return formatControlNumber({ year, sequence: input.nextSequence });
}

/**
 * Control number with the sequence obscured, for logs and list views where the
 * full value adds nothing.
 *
 * @param {unknown} value
 * @returns {string} For example `BRGY-2026-••0041`, or `''` when unusable.
 */
export function maskControlNumber(value) {
  const parts = parseControlNumber(value);
  if (!parts) return '';
  const sequence = String(parts.sequence).padStart(SEQUENCE_WIDTH, '0');
  return `${parts.prefix}-${parts.year}-••${sequence.slice(-2)}`;
}