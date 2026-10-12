import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ConfigError, REPO_ROOT, parseConfig } from './index.js';

const LONG_SECRET = 'a'.repeat(48);

test('defaults describe a local mock development server', () => {
  const config = parseConfig({});
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.isProduction, false);
  assert.equal(config.isTest, false);
  assert.equal(config.port, 3000);
  assert.equal(config.publicBaseUrl, 'http://localhost:3000');
  assert.equal(config.sms.provider, 'mock');
  assert.equal(config.sms.textbeeApiKey, '');
  assert.equal(config.sms.fromLabel, 'Barangay Office');
});

test('the result and its sms section are frozen', () => {
  const config = parseConfig({});
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.sms), true);
});

test('PORT is coerced from its string form', () => {
  assert.equal(parseConfig({ PORT: '8080' }).port, 8080);
});

test('a non-numeric PORT is refused', () => {
  assert.throws(() => parseConfig({ PORT: 'http' }), ConfigError);
});

test('an out-of-range PORT is refused', () => {
  assert.throws(() => parseConfig({ PORT: '0' }), ConfigError);
  assert.throws(() => parseConfig({ PORT: '70000' }), ConfigError);
});

test('an unknown NODE_ENV is refused', () => {
  assert.throws(() => parseConfig({ NODE_ENV: 'staging' }), ConfigError);
});

test('PUBLIC_BASE_URL must be an absolute http(s) URL', () => {
  assert.throws(() => parseConfig({ PUBLIC_BASE_URL: '/relative' }), ConfigError);
  assert.throws(() => parseConfig({ PUBLIC_BASE_URL: 'ftp://example.test' }), ConfigError);
  assert.equal(parseConfig({ PUBLIC_BASE_URL: 'https://example.test' }).publicBaseUrl, 'https://example.test');
});

test('the default public base url tracks the configured port', () => {
  assert.equal(parseConfig({ PORT: '4321' }).publicBaseUrl, 'http://localhost:4321');
});

test('production refuses to start without SESSION_SECRET', () => {
  assert.throws(() => parseConfig({ NODE_ENV: 'production' }), ConfigError);
});

test('production refuses a short SESSION_SECRET', () => {
  assert.throws(() => parseConfig({ NODE_ENV: 'production', SESSION_SECRET: 'too-short' }), ConfigError);
});

test('production accepts a long SESSION_SECRET and keeps it verbatim', () => {
  const config = parseConfig({ NODE_ENV: 'production', SESSION_SECRET: LONG_SECRET });
  assert.equal(config.sessionSecret, LONG_SECRET);
  assert.equal(config.sessionSecretIsEphemeral, false);
});

test('development keeps a provided secret and never marks it ephemeral', () => {
  const config = parseConfig({ SESSION_SECRET: 'dev-secret' });
  assert.equal(config.sessionSecret, 'dev-secret');
  assert.equal(config.sessionSecretIsEphemeral, false);
});

test('development generates a distinct ephemeral secret per call', () => {
  const first = parseConfig({});
  const second = parseConfig({});
  assert.equal(first.sessionSecretIsEphemeral, true);
  assert.match(first.sessionSecret, /^[0-9a-f]{96}$/);
  assert.notEqual(first.sessionSecret, second.sessionSecret);
});

test('an unknown SMS_PROVIDER is refused', () => {
  assert.throws(() => parseConfig({ SMS_PROVIDER: 'semaphore' }), ConfigError);
});

test('the mock provider needs no TEXTBEE_API_KEY', () => {
  const config = parseConfig({ SMS_PROVIDER: 'mock', TEXTBEE_API_KEY: '' });
  assert.equal(config.sms.provider, 'mock');
});

test('the textbee provider requires TEXTBEE_API_KEY', () => {
  assert.throws(() => parseConfig({ SMS_PROVIDER: 'textbee', TEXTBEE_API_KEY: '' }), ConfigError);
});

test('the textbee provider accepts a key and normalizes the provider name', () => {
  const config = parseConfig({ SMS_PROVIDER: '  TextBee ', TEXTBEE_API_KEY: 'tb_test_key' });
  assert.equal(config.sms.provider, 'textbee');
  assert.equal(config.sms.textbeeApiKey, 'tb_test_key');
});

test('SMS_FROM_LABEL overrides the default sender label', () => {
  assert.equal(parseConfig({ SMS_FROM_LABEL: 'Brgy Mabini' }).sms.fromLabel, 'Brgy Mabini');
});

test('REPO_ROOT points at the directory that holds package.json', () => {
  assert.equal(existsSync(path.join(REPO_ROOT, 'package.json')), true);
});
