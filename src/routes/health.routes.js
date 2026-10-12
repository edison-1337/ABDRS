/**
 * Liveness probe. Deliberately does not touch the database: it answers whether
 * this process is up and serving, which is what a restart policy or a load
 * balancer needs. A database-aware readiness probe belongs with the pool in a
 * later phase.
 */
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'abdrs' });
});
