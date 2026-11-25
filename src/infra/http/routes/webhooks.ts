import { Router } from 'express';

export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/inbound-messages', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});
