import { Router } from 'express';
import { runReminderPass } from '@/infra/wiring/reminders';

export const jobsRouter = Router();

jobsRouter.post('/jobs/reminders/run', async (_req, res) => {
  res.json(await runReminderPass());
});
