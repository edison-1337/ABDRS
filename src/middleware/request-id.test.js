import assert from 'node:assert/strict';
import test from 'node:test';

import { requestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fakeReq(headerValue) {
  return { get: () => headerValue };
}

function fakeRes() {
  const headers = {};
  return {
    headers,
    setHeader(key, value) {
      headers[key] = value;
    },
  };
}

function run(headerValue) {
  const req = fakeReq(headerValue);
  const res = fakeRes();
  let nextCalled = false;
  requestId(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test('generates a UUID when no inbound id is supplied', () => {
  const { req, res, nextCalled } = run(undefined);
  assert.match(req.id, UUID);
  assert.equal(res.headers['X-Request-Id'], req.id);
  assert.equal(nextCalled, true);
});

test('honours a short, safe inbound id verbatim', () => {
  const { req } = run('trace-abc_123.4:5');
  assert.equal(req.id, 'trace-abc_123.4:5');
});

test('replaces an inbound id that contains unsafe characters', () => {
  const { req } = run('bad id with spaces');
  assert.match(req.id, UUID);
});

test('replaces an over-long inbound id', () => {
  const { req } = run('a'.repeat(129));
  assert.match(req.id, UUID);
});

test('replaces an empty inbound id', () => {
  const { req } = run('');
  assert.match(req.id, UUID);
});

test('always reports the id back in the response header', () => {
  const { req, res } = run('trace-1');
  assert.equal(res.headers['X-Request-Id'], 'trace-1');
  assert.equal(res.headers['X-Request-Id'], req.id);
});
