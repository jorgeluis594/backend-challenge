import { makeCancelAppointment } from '@/app/cancel-appointment';
import { makeCreateAppointment } from '@/app/create-appointment';
import { makeGetAppointment } from '@/app/get-appointment';
import { makeRescheduleAppointment } from '@/app/reschedule-appointment';
import { config } from '@/infra/config';
import { transaction } from '@/infra/db';
import { appointmentRepository } from '@/infra/repositories/appointments';
import { clinicRepository } from '@/infra/repositories/clinics';
import { patientRepository } from '@/infra/repositories/patients';
import { reminderRepository } from '@/infra/repositories/reminders';

export const createAppointment = makeCreateAppointment({
  clinics: clinicRepository,
  patients: patientRepository,
  appointments: appointmentRepository,
  quietHours: config.quietHours,
});
export const getAppointment = makeGetAppointment({ appointments: appointmentRepository });
export const rescheduleAppointment = makeRescheduleAppointment({
  transaction,
  appointments: appointmentRepository,
  reminders: reminderRepository,
  clinics: clinicRepository,
  quietHours: config.quietHours,
});
export const cancelAppointment = makeCancelAppointment({
  transaction,
  appointments: appointmentRepository,
  reminders: reminderRepository,
});
