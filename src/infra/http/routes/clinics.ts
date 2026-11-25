import { Router } from 'express';
import { sendInvalidBody } from '@/infra/http/errors';
import { createClinicSchema } from '@/infra/http/schemas';
import { createClinic } from '@/infra/wiring/clinics';

export const clinicsRouter = Router();

clinicsRouter.post('/clinics', async (req, res) => {
  const body = createClinicSchema.safeParse(req.body);
  if (!body.success) return sendInvalidBody(res, body.error);
  res.status(201).json(await createClinic(body.data));
});
