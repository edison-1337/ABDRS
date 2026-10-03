/**
 * The request lifecycle, declared exactly once.
 *
 * Nothing outside this module may move a request between states. A route
 * handler that writes `status = 'approved'` directly is a defect regardless of
 * how it looks, because it bypasses the transition table, the validator, the
 * audit history, and the outbox write that belong to the change.
 *
 * Pure and side-effect free. The database knows nothing about this table; it
 * only enforces that a status is one of the six legal values.
 *
 * @typedef {'submitted'|'under_review'|'approved'|'released'|'rejected'|'cancelled'} RequestStatus
 */

/** Every status a request may hold. Mirrors the schema CHECK constraint. */
export const REQUEST_STATUSES = /** @type {const} */ ([
  'submitted',
  'under_review',
  'approved',
  'released',
  'rejected',
  'cancelled',
]);

/** The status every request is created in. */
export const INITIAL_STATUS = /** @type {RequestStatus} */ ('submitted');

/**
 * Statuses that mean the request will never change again.
 *
 * A terminal status is not merely "no outgoing transitions are declared" -- it
 * is asserted at runtime by `assertNotTerminal` so a future edit to the
 * transition table cannot quietly revive a released document.
 */
export const TERMINAL_STATUSES = /** @type {const} */ (['released', 'rejected', 'cancelled']);

/**
 * Which staff roles may perform a transition out of a status.
 *
 * An empty array means any authenticated staff member may do it. This is a
 * second gate: ownership decides *whose* request, this decides *who* may act.
 *
 * @type {Readonly<Record<RequestStatus, readonly string[]>>}
 */
export const TRANSITION_ROLES = /** @type {const} */ ({
  submitted: ['clerk', 'captain', 'admin'],
  under_review: ['clerk', 'captain', 'admin'],
  approved: ['captain', 'admin'],
  released: ['clerk', 'captain', 'admin'],
  rejected: ['clerk', 'captain', 'admin'],
  cancelled: [],
});

/**
 * Reasons a resident may cancel their own request without staff involvement.
 *
 * @type {Readonly<Record<'submitted'|'under_review', readonly string[]>>}
 */
export const RESIDENT_CANCEL_REASONS = /** @type {const} */ ({
  submitted: ['no_longer_needed', 'submitted_in_error', 'requirements_changed'],
  under_review: ['no_longer_needed', 'requirements_changed'],
});

/**
 * The transition table.
 *
 * @type {Readonly<Record<RequestStatus, readonly RequestStatus[]>>}
 */
export const ALLOWED_TRANSITIONS = /** @type {const} */ ({
  submitted: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected', 'cancelled'],
  approved: ['released', 'rejected', 'cancelled'],
  // Terminal. Intentionally empty.
  released: [],
  rejected: [],
  cancelled: [],
});

/**
 * Every legal transition as a flat list, for assertions and documentation.
 *
 * @type {ReadonlyArray<{from: RequestStatus, to: RequestStatus}>}
 */
export const TRANSITIONS = /** @type {const} */ (
  REQUEST_STATUSES.flatMap((from) =>
    ALLOWED_TRANSITIONS[from].map((to) => /** @type {{from: RequestStatus, to: RequestStatus}} */ ({ from, to })),
  )
);

export class WorkflowError extends Error {
  /**
   * @param {string} message Safe to show a resident or staff member.
   * @param {string} code
   * @param {{from?: string, to?: string, allowed?: readonly string[]}} [details]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {unknown} value
 * @returns {value is RequestStatus}
 */
export function isRequestStatus(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (REQUEST_STATUSES).includes(value);
}

/**
 * @param {RequestStatus} status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return /** @type {readonly string[]} */ (TERMINAL_STATUSES).includes(status);
}

/**
 * The single authority on whether a state change is allowed.
 *
 * @param {RequestStatus} from Current status.
 * @param {RequestStatus} to Requested status.
 * @returns {boolean}
 */
export function isLegalTransition(from, to) {
  if (!isRequestStatus(from) || !isRequestStatus(to)) return false;
  return /** @type {readonly string[]} */ (ALLOWED_TRANSITIONS[from]).includes(to);
}

/**
 * Human-readable labels for the interface. Owned here so the browser never
 * hardcodes a status name.
 *
 * @type {Readonly<Record<RequestStatus, string>>}
 */
export const STATUS_LABELS = /** @type {const} */ ({
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  released: 'Released',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
});

/**
 * Ordered status values for a timeline, earliest to latest.
 *
 * `rejected` and `cancelled` are excluded because they are branches off the
 * main line, not stages along it.
 *
 * @type {readonly RequestStatus[]}
 */
export const MAINLINE_SEQUENCE = /** @type {const} */ (['submitted', 'under_review', 'approved', 'released']);

/**
 * @param {RequestStatus} status
 * @returns {number} Zero-based position on the mainline, or -1 when off it.
 */
export function mainlineIndex(status) {
  return /** @type {readonly string[]} */ (MAINLINE_SEQUENCE).indexOf(status);
}

/**
 * Throws unless the transition is legal.
 *
 * @param {RequestStatus} from
 * @param {RequestStatus} to
 * @returns {void}
 * @throws {WorkflowError}
 */
export function assertLegalTransition(from, to) {
  if (!isRequestStatus(from)) {
    throw new WorkflowError('The request has an unrecognised current status.', 'unknown_status', { from });
  }
  if (!isRequestStatus(to)) {
    throw new WorkflowError('The requested status is not valid.', 'unknown_status', { to });
  }
  if (isLegalTransition(from, to)) return;

  const allowed = ALLOWED_TRANSITIONS[from];
  throw new WorkflowError(
    allowed.length === 0
      ? `A request that is ${STATUS_LABELS[from].toLowerCase()} can no longer be changed.`
      : `A request that is ${STATUS_LABELS[from].toLowerCase()} cannot be moved to ${STATUS_LABELS[to].toLowerCase()}.`,
    allowed.length === 0 ? 'terminal_status' : 'illegal_transition',
    { from, to, allowed },
  );
}

/**
 * Throws if the status is terminal.
 *
 * Use before performing side effects on a request that has already been
 * released, so a released document is never edited by a late request.
 *
 * @param {RequestStatus} status
 * @returns {void}
 * @throws {WorkflowError}
 */
export function assertNotTerminal(status) {
  if (isTerminalStatus(status)) {
    throw new WorkflowError(
      `This request is already ${STATUS_LABELS[status].toLowerCase()} and can no longer be changed.`,
      'terminal_status',
      { from: status },
    );
  }
}

/**
 * Throws unless the actor's role may perform `from -> to`.
 *
 * @param {RequestStatus} from
 * @param {RequestStatus} to
 * @param {string} role Caller's staff role.
 * @returns {void}
 * @throws {WorkflowError}
 */
export function assertRoleMayTransition(from, to, role) {
  const roles = /** @type {readonly string[]} */ (TRANSITION_ROLES[from] ?? []);
  if (roles.length === 0) return;
  if (!roles.includes(role)) {
    throw new WorkflowError(
      `Your role cannot move a request from ${STATUS_LABELS[from].toLowerCase()} to ${STATUS_LABELS[to].toLowerCase()}.`,
      'role_not_permitted',
      { from, to },
    );
  }
}

/**
 * Validates a rejection reason.
 *
 * Rule 4: a rejection is not a state change, it is a state change plus an
 * explanation. An empty reason is a `critical` defect, not a cosmetic gap.
 *
 * @param {unknown} reason
 * @returns {string} The trimmed reason.
 * @throws {WorkflowError}
 */
export function assertRejectionReason(reason) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length === 0) {
    throw new WorkflowError('A reason is required when rejecting a request.', 'reason_required');
  }
  if (trimmed.length > 500) {
    throw new WorkflowError('The rejection reason must be 500 characters or fewer.', 'reason_too_long');
  }
  return trimmed;
}

/**
 * Validates a resident-initiated cancellation reason.
 *
 * @param {RequestStatus} from
 * @param {unknown} reason
 * @returns {string} The trimmed reason.
 * @throws {WorkflowError}
 */
export function assertCancellationReason(from, reason) {
  const allowed = /** @type {readonly string[]} */ (RESIDENT_CANCEL_REASONS[from] ?? []);
  const value = typeof reason === 'string' ? reason.trim() : '';

  if (allowed.length === 0) {
    throw new WorkflowError(
      `A request that is ${STATUS_LABELS[from].toLowerCase()} can no longer be cancelled by the resident.`,
      'cancellation_not_available',
      { from },
    );
  }
  if (!allowed.includes(value)) {
    throw new WorkflowError('Select a valid cancellation reason.', 'invalid_cancellation_reason', {
      from,
      allowed,
    });
  }
  return value;
}