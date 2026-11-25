import { Router } from 'express';
import { sendError, sendInvalidBody } from '@/infra/http/errors';
import { appointmentIdSchema, clinicIdSchema, createAppointmentSchema, patientIdSchema } from '@/infra/http/schemas';
import { cancelAppointment, createAppointment, getAppointment } from '@/infra/wiring/appointments';

export const appointmentsRouter = Router();

appointmentsRouter.post('/appointments', async (req, res) => {
  const body = createAppointmentSchema.safeParse(req.body);
  if (!body.success) return sendInvalidBody(res, body.error);
  const clinicId = clinicIdSchema.safeParse(body.data.clinicId);
  if (!clinicId.success) return sendError(res, 'CLINIC_NOT_FOUND');
  const patientId = patientIdSchema.safeParse(body.data.patientId);
  if (!patientId.success) return sendError(res, 'PATIENT_NOT_FOUND');
  const appointment = await createAppointment({ clinicId: clinicId.data, patientId: patientId.data, startsAt: body.data.startsAt });
  if (!appointment.success) return sendError(res, appointment.error);
  res.status(201).json(appointment.data);
});

appointmentsRouter.get('/appointments/:id', async (req, res) => {
  const id = appointmentIdSchema.safeParse(req.params.id);
  if (!id.success) return sendError(res, 'APPOINTMENT_NOT_FOUND');
  const appointment = await getAppointment({ id: id.data });
  if (!appointment.success) return sendError(res, appointment.error);
  res.json(appointment.data);
});

appointmentsRouter.patch('/appointments/:id', (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

appointmentsRouter.post('/appointments/:id/cancel', async (req, res) => {
  const id = appointmentIdSchema.safeParse(req.params.id);
  if (!id.success) return sendError(res, 'APPOINTMENT_NOT_FOUND');
  const appointment = await cancelAppointment({ id: id.data });
  if (!appointment.success) return sendError(res, appointment.error);
  res.json(appointment.data);
});
