import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from '@/infra/config';
import { appointmentsRouter } from '@/infra/http/routes/appointments';
import { clinicsRouter } from '@/infra/http/routes/clinics';
import { clockRouter } from '@/infra/http/routes/clock';
import { healthRouter } from '@/infra/http/routes/health';
import { jobsRouter } from '@/infra/http/routes/jobs';
import { patientsRouter } from '@/infra/http/routes/patients';
import { webhooksRouter } from '@/infra/http/routes/webhooks';

export const app = express();

app.use(express.json());
app.use(healthRouter, clinicsRouter, patientsRouter, appointmentsRouter, jobsRouter, webhooksRouter);
if (config.testClock) app.use(clockRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'Malformed JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
