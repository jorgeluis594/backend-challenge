import { Router } from 'express';
import { setClock } from '@/infra/clock';
import { sendInvalidBody } from '@/infra/http/errors';
import { setClockSchema } from '@/infra/http/schemas';

export const clockRouter = Router();

clockRouter.put('/test/clock', (req, res) => {
  const body = setClockSchema.safeParse(req.body);
  if (!body.success) return sendInvalidBody(res, body.error);
  setClock(body.data.now);
  res.status(204).end();
});
