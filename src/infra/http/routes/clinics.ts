import { Router } from 'express';

export const clinicsRouter = Router();

clinicsRouter.post('/clinics', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
