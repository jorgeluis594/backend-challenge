import { Router } from 'express';

export const appointmentsRouter = Router();

appointmentsRouter.post('/appointments', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

appointmentsRouter.get('/appointments/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

appointmentsRouter.patch('/appointments/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

appointmentsRouter.post('/appointments/:id/cancel', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
