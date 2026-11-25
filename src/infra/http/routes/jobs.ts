import { Router } from 'express';

export const jobsRouter = Router();

jobsRouter.post('/jobs/reminders/run', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
