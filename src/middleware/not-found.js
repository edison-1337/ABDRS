/**
 * Terminal 404. Any request that reached the end of the chain is handed to the
 * error handler as a 404 `ApiError`, so `toErrorResponse` remains the single
 * place a status is decided.
 */
import { ApiError } from '../lib/api/errors.js';

/**
 * @param {import('express').Request} _req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function notFound(_req, _res, next) {
  next(new ApiError(404, 'That address does not exist.', 'not_found'));
}
