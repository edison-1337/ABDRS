/**
 * Validation findings.
 *
 * The validator classifies every problem with a request into one of three
 * severities, and severity -- not phrasing -- decides whether a write happens.
 *
 *   critical   blocks the transition
 *   warning    the write proceeds; an enabled rule or bound was violated
 *   suggestion informational only; never blocks
 *
 * The rule that keeps this honest: a `critical` finding is NEVER downgraded to
 * make a transition succeed. Severity is chosen when the finding is created,
 * from the rule that produced it, and that choice is auditable in the code.
 */

import { DomainError } from '../api/errors.js';

/** @typedef {'critical'|'warning'|'suggestion'} Severity */

/** @typedef {{severity: Severity, code: string, message: string, [k: string]: unknown}} Finding */

/** Every severity, in descending order of consequence. */
export const SEVERITIES = /** @type {const} */ (['critical', 'warning', 'suggestion']);

/**
 * Creates a finding.
 *
 * @param {Severity} severity
 * @param {string} code Stable identifier, safe for the client to branch on.
 * @param {string} message Written for a resident or staff member to read. Safe
 *   to disclose, because it is composed here rather than derived from a driver.
 * @param {Record<string, unknown>} [details]
 * @returns {Finding}
 */
export function createFinding(severity, code, message, details = {}) {
  if (!/** @type {readonly string[]} */ (SEVERITIES).includes(severity)) {
    throw new TypeError(`Unknown severity: ${severity}`);
  }
  return { severity, code, message, ...details };
}

/**
 * @param {Finding} finding
 * @returns {boolean} True when this finding must stop the transition.
 */
export function isBlocking(finding) {
  return finding.severity === 'critical';
}

/**
 * @param {Finding[]} findings
 * @returns {Finding[]} Only the findings that block.
 */
export function blockingFindings(findings) {
  return findings.filter(isBlocking);
}

/**
 * @param {Finding[]} findings
 * @returns {Finding[]} Only the findings that do not block.
 */
export function advisoryFindings(findings) {
  return findings.filter((finding) => !isBlocking(finding));
}

/**
 * @param {Finding[]} findings
 * @returns {boolean}
 */
export function hasCritical(findings) {
  return findings.some(isBlocking);
}

/**
 * Throws when any finding blocks.
 *
 * The message names the first blocking finding only. Returning all of them
 * invites a UI that shows a wall of text; the resident needs the one thing they
 * have to fix.
 *
 * @param {Finding[]} findings
 * @param {string} [message] Overrides the default summary.
 * @returns {void}
 * @throws {import('../api/errors.js').DomainError}
 */
export function assertNoCriticalFindings(findings, message) {
  const blocking = blockingFindings(findings);
  if (blocking.length === 0) return;

  const first = /** @type {Finding} */ (blocking[0]);
  throw new DomainError(message ?? first.message, first.code, findings);
}

/**
 * Groups findings by severity for a summary panel.
 *
 * @param {Finding[]} findings
 * @returns {{critical: Finding[], warning: Finding[], suggestion: Finding[]}}
 */
export function groupBySeverity(findings) {
  return {
    critical: findings.filter((f) => f.severity === 'critical'),
    warning: findings.filter((f) => f.severity === 'warning'),
    suggestion: findings.filter((f) => f.severity === 'suggestion'),
  };
}