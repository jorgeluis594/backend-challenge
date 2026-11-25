import { Router } from 'express';

export const patientsRouter = Router();

patientsRouter.post('/patients', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
