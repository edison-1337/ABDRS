/**
 * Public surface of the request domain.
 *
 * Everything about a request's lifecycle, validity, and identity is decided here
 * or below. Route handlers and browser controllers call into this module and do
 * not reimplement any of it.
 *
 * @typedef {import('./workflow.js').RequestStatus} RequestStatus
 */

export {
  REQUEST_STATUSES,
  INITIAL_STATUS,
  TERMINAL_STATUSES,
  ALLOWED_TRANSITIONS,
  TRANSITIONS,
  TRANSITION_ROLES,
  RESIDENT_CANCEL_REASONS,
  STATUS_LABELS,
  MAINLINE_SEQUENCE,
  WorkflowError,
  isRequestStatus,
  isTerminalStatus,
  isLegalTransition,
  assertLegalTransition,
  assertNotTerminal,
  assertRoleMayTransition,
  assertRejectionReason,
  assertCancellationReason,
  mainlineIndex,
} from './workflow.js';

export {
  CONTROL_NUMBER_PREFIX,
  CONTROL_NUMBER_PATTERN,
  formatControlNumber,
  parseControlNumber,
  isValidControlNumber,
  buildControlNumber,
} from './control-number.js';

export { checkRequirements, missingRequirements, requirementsSatisfied } from './requirements.js';
export { SEVERITIES, isBlocking, assertNoCriticalFindings, createFinding } from './validation.js';
export { canRequestDocumentType, isDocumentTypeRequestable } from './eligibility.js';