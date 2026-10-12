/**
 * Assigns a correlation id to every request and echoes it back.
 *
 * An inbound `X-Request-Id` is honoured so a caller (or an upstream proxy) can
 * correlate its own logs with ours, but only when it is short and drawn from a
 * conservative character set. Anything else is replaced with a fresh UUID
 * rather than trusted, so a client cannot inject arbitrary bytes into our logs
 * or the response header.
 */
import { randomUUID } from 'node:crypto';

const MAX_LENGTH = 128;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestId(req, res, next) {
  const supplied = req.get('x-request-id');
  req.id =
    typeof supplied === 'string' && supplied.length > 0 && supplied.length <= MAX_LENGTH && SAFE_ID.test(supplied)
      ? supplied
      : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
