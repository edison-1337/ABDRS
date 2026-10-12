import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiError,
  DomainError,
  buildErrorBody,
  isPostgresError,
  toErrorResponse,
} from './errors.js';

function pgError(code, message = `driver said ${code}`) {
  const error = new Error(message);
  error.code = code;
  return error;
}

test('isPostgresError matches five-character SQLSTATE codes', () => {
  assert.equal(isPostgresError(pgError('23505')), true);
  assert.equal(isPostgresError(pgError('40P01')), true);
  assert.equal(isPostgresError({ code: '23505', message: 'x' }), true);
});

test('isPostgresError rejects non-SQLSTATE shapes', () => {
  assert.equal(isPostgresError(null), false);
  assert.equal(isPostgresError('23505'), false);
  assert.equal(isPostgresError(new Error('boom')), false);
  assert.equal(isPostgresError({ errno: 'ER_DUP_ENTRY', message: 'x' }), false);
  assert.equal(isPostgresError({ code: 'ENOENT', message: 'x' }), false);
  assert.equal(isPostgresError({ code: 'short', message: 'x' }), false);
});

test('a duplicate key violation is surfaced as a 409 duplicate', () => {
  const response = toErrorResponse(pgError('23505'), { operation: 'test.duplicate' });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'duplicate');
  assert.equal(response.body.error, 'That record already exists.');
});

test('retryable SQLSTATE classes map to 503 busy', () => {
  for (const code of ['40001', '40P01', '55P03', '08006']) {
    const response = toErrorResponse(pgError(code), { operation: 'test.retry' });
    assert.equal(response.status, 503, `expected 503 for ${code}`);
    assert.equal(response.body.code, 'busy');
  }
});

test('an unmapped SQLSTATE collapses to the generic 500 body', () => {
  const response = toErrorResponse(pgError('P0001'), { operation: 'test.unmapped' });
  assert.equal(response.status, 500);
  assert.equal(response.body.code, 'internal_error');
  assert.equal(response.body.error, 'An unexpected error occurred. Please try again.');
  assert.equal(typeof response.body.request_id, 'string');
});

test('a raw driver message is never echoed for a matched error', () => {
  const response = toErrorResponse(pgError('23505', 'violates unique constraint requests'), {
    operation: 'test.echo',
  });
  assert.notEqual(response.body.error, 'violates unique constraint requests');
});

test('ApiError keeps its own status, code, and message', () => {
  const response = toErrorResponse(new ApiError(404, 'Not found.', 'not_found'), {
    operation: 'test.apierror',
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'not_found');
});

test('a JSON syntax error maps to 400 invalid_json', () => {
  const response = toErrorResponse(new SyntaxError('Unexpected token'), { operation: 'test.json' });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'invalid_json');
});

test('a DomainError maps to 422 and preserves findings', () => {
  const response = toErrorResponse(
    new DomainError('Cannot approve.', 'requirements_unmet', [
      { severity: 'critical', code: 'missing_document', message: 'Missing.' },
    ]),
    { operation: 'test.domain' },
  );
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'requirements_unmet');
  assert.equal(response.body.findings.length, 1);
});

test('buildErrorBody spreads safe extra fields', () => {
  assert.deepEqual(buildErrorBody(409, 'duplicate', 'Exists.', { duplicate_of: 'BRGY-2026-000041' }), {
    error: 'Exists.',
    code: 'duplicate',
    status: 409,
    duplicate_of: 'BRGY-2026-000041',
  });
});