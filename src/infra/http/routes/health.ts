import { Router } from 'express';
import { prisma } from '@/infra/db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  await prisma.clinic.count();
  res.json({ status: 'ok' });
});
