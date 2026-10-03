/**
 * Typed HTTP error surface for the API routes.
 *
 * `toErrorResponse` is the ONLY place a status code is decided. Nothing else in
 * this repository assigns an HTTP status to a failure, and nothing else is
 * allowed to describe a failure to the client.
 *
 * Disclosure rule (deliberate, and the reason this file exists): a message is
 * echoed ONLY when it originates in this repository's own source -- that is,
 * from an `ApiError` constructed here, or from a `DomainError` built from our
 * own domain data. Every other value, including one that merely LOOKS like it
 * came from here (a plain `Error`, a string, a MySQL driver error, a TextBee
 * error body), collapses to a fixed generic body.
 *
 * The failure this prevents: a resident sees "ER_DUP_ENTRY: Duplicate entry
 * 'BRGY-2026-000041' for key 'requests.control_number'", which discloses the
 * schema, the row, and the fact that a control number exists.
 */

/** The one generic body. Never interpolate anything into it. */
const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * A failure this repository constructed deliberately.
 *
 * @property {number} status HTTP status.
 * @property {string} code Stable machine-readable code for the client.
 * @property {Record<string, unknown>} [extra] Additional safe fields.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message Safe to show a resident.
   * @param {string} code
   * @param {Record<string, unknown>} [extra]
   */
  constructor(status, message, code, extra) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * A domain rejection that carries structured findings.
 *
 * Mirrors the request validator: `critical` findings blocked the transition and
 * are safe to return because they were built from our own rule definitions, not
 * from a driver message.
 */
export class DomainError extends Error {
  /**
   * @param {string} message Safe to show a resident or staff member.
   * @param {string} code
   * @param {Array<{severity: string, code: string, message: string, [k: string]: unknown}>} findings
   */
  constructor(message, code, findings = []) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.findings = findings;
  }
}

/**
 * MySQL SQLSTATE -> HTTP.
 *
 * 23000/23001 (integrity constraint) and 23xxx generally are DATA-INTEGRITY
 * defects on our side, not caller errors, so they map to 500 with a generic
 * body. A duplicate control number or a missing foreign key means a bug, and
 * saying so to the caller would only invite a confusing retry.
 *
 * 40001 (serialization_failure) and 40P01-equivalent lock wait timeouts are
 * genuinely retryable, so they map to 503 rather than an opaque 500 that would
 * cause a client retry storm.
 */
const MYSQL_ERRNO_TO_HTTP = {
  ER_DUP_ENTRY: { status: 409, code: 'duplicate', message: 'That record already exists.' },
  ER_NO_REFERENCED_ROW: { status: 500, code: 'integrity_violation', message: INTERNAL_ERROR_MESSAGE },
  ER_ROW_IS_REFERENCED: { status: 409, code: 'still_referenced', message: 'That record is still in use.' },
  ER_BAD_NULL_ERROR: { status: 500, code: 'integrity_violation', message: INTERNAL_ERROR_MESSAGE },
  ER_DATA_TOO_LONG: { status: 400, code: 'invalid_parameter_value', message: 'One of the values submitted is too long.' },
  ER_LOCK_WAIT_TIMEOUT: { status: 503, code: 'busy', message: 'The system is busy. Please retry in a moment.' },
  ER_LOCK_DEADLOCK: { status: 503, code: 'busy', message: 'The system is busy. Please retry in a moment.' },
  PROTOCOL_CONNECTION_LOST: { status: 503, code: 'busy', message: 'The system is busy. Please retry in a moment.' },
};

/**
 * Builds the standard JSON error body.
 *
 * @param {number} status
 * @param {string} code
 * @param {string} message Already safe to disclose.
 * @param {Record<string, unknown>} [extra]
 * @returns {{error: string, code: string, [k: string]: unknown}}
 */
export function buildErrorBody(status, code, message, extra) {
  return { error: message, code, status, ...(extra ?? {}) };
}

/**
 * Structural guard for a MySQL driver error. Matched on `errno`/`code` rather
 * than `instanceof` so the error is recognised regardless of which copy of the
 * driver produced it.
 *
 * @param {unknown} error
 * @returns {error is {errno?: string, code?: string, message?: string}}
 */
export function isMysqlError(error) {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = /** @type {{errno?: unknown, code?: unknown, message?: unknown}} */ (error);
  return (
    typeof candidate.message === 'string' &&
    (typeof candidate.errno === 'string' || typeof candidate.code === 'string')
  );
}

function requestId() {
  return globalThis.crypto.randomUUID();
}

/**
 * @typedef {object} ErrorContext
 * @property {string} operation Label used in the log line, e.g. `requests.approve`.
 * @property {string} [residentId] Owning resident, as an id. Never a name.
 * @property {string} [requestRef] Request control number or internal id.
 */

/**
 * Maps a thrown value to a status, a code, a body, and a log line.
 *
 * Order matters and it is an allow-list:
 *   ApiError          -> its own status/code/message (constructed here)
 *   SyntaxError       -> 400 invalid_json
 *   DomainError       -> 422 with its findings, shape preserved exactly
 *   mysql error       -> the table above
 *   anything else     -> 500 internal_error + a request_id, generic body
 *
 * Never logs a request body, a session token, a gateway key, a message body, a
 * contact number, or any other resident personal data.
 *
 * @param {unknown} error
 * @param {ErrorContext} context
 * @returns {{status: number, body: Record<string, unknown>}}
 */
export function toErrorResponse(error, context) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: buildErrorBody(error.status, error.code, error.message, error.extra),
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      body: buildErrorBody(400, 'invalid_json', 'Request body must be valid JSON.'),
    };
  }

  if (error instanceof DomainError) {
    return {
      status: 422,
      body: buildErrorBody(422, error.code, error.message, { findings: error.findings }),
    };
  }

  if (isMysqlError(error)) {
    const driverCode = /** @type {any} */ (error).errno ?? /** @type {any} */ (error).code;
    const mapped = MYSQL_ERRNO_TO_HTTP[driverCode];
    if (mapped) {
      console.error(`[${context.operation}] failed`, {
        operation: context.operation,
        residentId: context.residentId,
        requestRef: context.requestRef,
        driverCode,
      });
      return { status: mapped.status, body: buildErrorBody(mapped.status, mapped.code, mapped.message) };
    }
  }

  const id = requestId();
  console.error(`[${context.operation}] failed`, {
    operation: context.operation,
    residentId: context.residentId,
    requestRef: context.requestRef,
    requestId: id,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  return {
    status: 500,
    body: buildErrorBody(500, 'internal_error', INTERNAL_ERROR_MESSAGE, { request_id: id }),
  };
}