/**
 * Environment configuration.
 *
 * Parsing and validating configuration is a decision, so it lives in
 * `src/lib` rather than in `server.js`. Importing this module never reads the
 * environment by itself; call `loadConfig()` once at boot. `parseConfig()` is
 * pure and takes the environment as an argument so it can be tested without
 * touching `process.env`.
 *
 * Two credentials shape the validation:
 *
 *   - `SESSION_SECRET` is required in production. In development and test it
 *     may be absent; rather than ship a weak default, an ephemeral secret is
 *     generated for the process lifetime and the caller is told it is
 *     ephemeral.
 *   - `TEXTBEE_API_KEY` is required only when `SMS_PROVIDER=textbee`. The mock
 *     provider performs no network call and needs no credential, which is why
 *     local development works with an empty key.
 *   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required in
 *     production. The service key is a full-access secret and must stay
 *     server-side.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root, derived from this file's location. */
export const REPO_ROOT = path.resolve(CONFIG_DIR, '..', '..', '..');

const NODE_ENVS = new Set(['development', 'test', 'production']);
const SMS_PROVIDERS = new Set(['mock', 'textbee']);
const DEFAULT_PORT = 3000;

/** Raised when the environment cannot produce a usable configuration. */
export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * @typedef {object} SmsConfig
 * @property {'mock'|'textbee'} provider
 * @property {string} textbeeApiKey Empty string unless provider is `textbee`.
 * @property {string} fromLabel
 */

/**
 * @typedef {object} SupabaseConfig
 * @property {string} url Project base URL, e.g. `https://<ref>.supabase.co`.
 * @property {string} anonKey Public-safe key; requires Row Level Security.
 * @property {string} serviceRoleKey Full-access server secret. Never log this value.
 */

/**
 * @typedef {object} Config
 * @property {'development'|'test'|'production'} nodeEnv
 * @property {boolean} isProduction
 * @property {boolean} isTest
 * @property {number} port
 * @property {string} publicBaseUrl
 * @property {string} sessionSecret Never log this value.
 * @property {boolean} sessionSecretIsEphemeral True when generated for this process.
 * @property {SmsConfig} sms
 * @property {SupabaseConfig} supabase
 * @property {string} databaseUrl Postgres connection string for DDL only. Empty unless provided.
 */

/**
 * @param {string|undefined} raw
 * @returns {number}
 */
function parsePort(raw) {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) {
    throw new ConfigError(`PORT must be an integer (received "${value}").`);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be between 1 and 65535 (received "${value}").`);
  }
  return port;
}

/**
 * @param {string} value
 * @param {string} name
 */
function assertHttpUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an absolute http(s) URL (received "${value}").`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an absolute http(s) URL (received "${value}").`);
  }
}

/**
 * Validates and coerces a raw environment into a frozen {@link Config}.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {Config}
 */
export function parseConfig(env = {}) {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim() || 'development';
  if (!NODE_ENVS.has(nodeEnv)) {
    throw new ConfigError(`NODE_ENV must be one of ${[...NODE_ENVS].join(', ')} (received "${nodeEnv}").`);
  }
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const port = parsePort(env.PORT);

  const publicBaseUrl = (env.PUBLIC_BASE_URL ?? '').trim() || `http://localhost:${port}`;
  assertHttpUrl(publicBaseUrl, 'PUBLIC_BASE_URL');

  const providedSecret = (env.SESSION_SECRET ?? '').trim();
  let sessionSecret = providedSecret;
  let sessionSecretIsEphemeral = false;
  if (providedSecret === '') {
    if (isProduction) {
      throw new ConfigError('SESSION_SECRET is required when NODE_ENV=production.');
    }
    // Both fallbacks run the same number of bytes through the same generator,
    // so the test environment is not measurably weaker than development.
    sessionSecret = randomBytes(48).toString('hex');
    sessionSecretIsEphemeral = true;
  } else if (isProduction && providedSecret.length < 32) {
    throw new ConfigError('SESSION_SECRET must be at least 32 characters when NODE_ENV=production.');
  }

  const provider = (env.SMS_PROVIDER ?? 'mock').trim().toLowerCase() || 'mock';
  if (!SMS_PROVIDERS.has(provider)) {
    throw new ConfigError(`SMS_PROVIDER must be one of ${[...SMS_PROVIDERS].join(', ')} (received "${provider}").`);
  }
  const textbeeApiKey = (env.TEXTBEE_API_KEY ?? '').trim();
  if (provider === 'textbee' && textbeeApiKey === '') {
    throw new ConfigError('TEXTBEE_API_KEY is required when SMS_PROVIDER=textbee.');
  }
  const fromLabel = (env.SMS_FROM_LABEL ?? '').trim() || 'Barangay Office';

  const supabaseUrl = (env.SUPABASE_URL ?? '').trim();
  if (supabaseUrl !== '') {
    assertHttpUrl(supabaseUrl, 'SUPABASE_URL');
  } else if (isProduction) {
    throw new ConfigError('SUPABASE_URL is required when NODE_ENV=production.');
  }

  const supabaseAnonKey = (env.SUPABASE_ANON_KEY ?? '').trim();
  const supabaseServiceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (supabaseServiceRoleKey === '' && isProduction) {
    throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY is required when NODE_ENV=production.');
  }

  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (databaseUrl !== '') {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new ConfigError('DATABASE_URL must be a valid postgres connection string.');
    }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new ConfigError(`DATABASE_URL must use the postgres:// protocol (received "${parsed.protocol}//").`);
    }
  }

  return Object.freeze({
    nodeEnv,
    isProduction,
    isTest,
    port,
    publicBaseUrl,
    sessionSecret,
    sessionSecretIsEphemeral,
    sms: Object.freeze({
      provider: /** @type {'mock'|'textbee'} */ (provider),
      textbeeApiKey,
      fromLabel,
    }),
    supabase: Object.freeze({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
    }),
    databaseUrl,
  });
}

/**
 * Loads `.env` and then `.env.local` into `process.env`.
 *
 * Both files are local and gitignored; `.env.local` is where this project
 * keeps its real values. dotenv never overwrites a key that is already set, so
 * the real process environment wins over `.env`, which in turn wins over
 * `.env.local`.
 *
 * @param {string} [root]
 */
export function loadEnvFiles(root = REPO_ROOT) {
  dotenv.config({
    path: [path.join(root, '.env'), path.join(root, '.env.local')],
    quiet: true,
  });
}

/**
 * Convenience for the entry point: load env files, then validate.
 *
 * @param {{env?: Record<string, string|undefined>, root?: string}} [options]
 * @returns {Config}
 */
export function loadConfig({ env = process.env, root = REPO_ROOT } = {}) {
  loadEnvFiles(root);
  return parseConfig(env);
}
