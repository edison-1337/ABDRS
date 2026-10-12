/**
 * API router. Every resource router is mounted here under its own path so
 * `src/server.js` has a single mount point and never grows a route table.
 */
import { Router } from 'express';

import { healthRouter } from './health.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
