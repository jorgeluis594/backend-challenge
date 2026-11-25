import { Router } from 'express';
import { sendError, sendInvalidBody } from '@/infra/http/errors';
import { clinicIdSchema, createPatientSchema } from '@/infra/http/schemas';
import { createPatient } from '@/infra/wiring/patients';

export const patientsRouter = Router();

patientsRouter.post('/patients', async (req, res) => {
  const body = createPatientSchema.safeParse(req.body);
  if (!body.success) return sendInvalidBody(res, body.error);
  const clinicId = clinicIdSchema.safeParse(body.data.clinicId);
  if (!clinicId.success) return sendError(res, 'CLINIC_NOT_FOUND');
  const patient = await createPatient({ ...body.data, clinicId: clinicId.data });
  if (!patient.success) return sendError(res, patient.error);
  res.status(201).json(patient.data);
});
