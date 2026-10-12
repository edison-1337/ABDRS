/**
 * The single terminal error boundary.
 *
 * It delegates every decision to `toErrorResponse` in `src/lib/api/errors.js`,
 * which is the only place an HTTP status is chosen and the only place a message
 * is cleared for disclosure. This middleware adds nothing to that policy beyond
 * turning the result into a response.
 *
 * The four-argument signature is what tells Express this is an error handler;
 * `next` is unused but must stay in place.
 */
import { toErrorResponse } from '../lib/api/errors.js';

/**
 * @param {unknown} error
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  const { status, body } = toErrorResponse(error, { operation: `${req.method} ${req.path}` });
  res.status(status).json(body);
}
