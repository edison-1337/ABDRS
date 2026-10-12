/**
 * Entry point.
 *
 * Responsibility: assemble the middleware chain, mount the API router, serve
 * the browser assets, and listen. It owns no business rule and no HTTP status;
 * every failure travels to `errorHandler` and is decided by
 * `src/lib/api/errors.js`.
 *
 * The app is exported as `createApp(config)` so a future integration test can
 * exercise the chain without binding a port. Only `startServer()` listens, and
 * that runs solely when this file is the process entry point.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { REPO_ROOT, loadConfig } from './lib/config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { apiRouter } from './routes/index.js';

const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const JSON_BODY_LIMIT = '100kb';

/**
 * Content Security Policy for a site that loads only its own CSS and JS.
 *
 * `upgrade-insecure-requests` is added only in production: over plain HTTP on
 * localhost it would make the browser rewrite every request to HTTPS and break
 * development.
 *
 * @param {import('./lib/config/index.js').Config} config
 * @returns {Record<string, string[]>}
 */
function contentSecurityPolicy(config) {
  /** @type {Record<string, string[]>} */
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'connect-src': ["'self'"],
    'font-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
  };
  // Helmet supplies `upgrade-insecure-requests` by default. Setting the
  // directive to `null` removes it from the merged policy; setting it to an
  // empty array would keep it. It is enabled only in production, because over
  // plain HTTP it tells the browser to rewrite every request to HTTPS, which
  // breaks local development.
  directives['upgrade-insecure-requests'] = config.isProduction ? [] : null;
  return directives;
}

/**
 * Builds the Express application. Does not listen.
 *
 * @param {import('./lib/config/index.js').Config} config
 * @returns {import('express').Express}
 */
export function createApp(config) {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: { directives: contentSecurityPolicy(config) } }));
  app.use(requestId);
  app.use(compression());
  app.use(cookieParser(config.sessionSecret));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', apiRouter);

  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      // Lets `/login` resolve to `login.html` so the pages are reachable
      // without the file extension.
      extensions: ['html'],
      etag: true,
      maxAge: config.isProduction ? '1h' : 0,
    }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * @param {import('./lib/config/index.js').Config} config
 * @returns {import('node:http').Server}
 */
export function startServer(config) {
  if (config.sessionSecretIsEphemeral) {
    console.warn(
      '[config] SESSION_SECRET is not set; using an ephemeral secret for this process. Signed cookies will not survive a restart.',
    );
  }

  const app = createApp(config);
  const server = app.listen(config.port);

  let bindFailed = false;
  server.on('listening', () => {
    // Deferred by one tick. On Windows a default dual-stack bind to an occupied
    // port emits `listening` and then `EADDRINUSE` in the same burst, so
    // announcing success immediately would print a line that is withdrawn a
    // moment later and send the reader looking at the wrong process.
    setTimeout(() => {
      if (bindFailed) return;
      console.log(
        `[server] listening on http://localhost:${config.port} (env=${config.nodeEnv}, sms=${config.sms.provider})`,
      );
    }, 0);
  });

  server.on('error', (error) => {
    bindFailed = true;
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    if (code === 'EADDRINUSE') {
      console.error(`[server] port ${config.port} is already in use. Set PORT to a free port and retry.`);
    } else {
      console.error('[server] failed to start', { errorCode: code ?? 'unknown' });
    }
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received; closing.`);
    server.close(() => process.exit(0));
    // Do not let a hung keep-alive connection delay shutdown forever.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

/** True when this module is the process entry point rather than an import. */
function isEntryPoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  const entryPath = path.resolve(entry);
  const modulePath = fileURLToPath(import.meta.url);
  return process.platform === 'win32'
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath;
}

if (isEntryPoint()) {
  startServer(loadConfig());
}
