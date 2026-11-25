import { Router } from 'express';
import { db } from '@/infra/db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  await db().clinic.count();
  res.json({ status: 'ok' });
});
