import { makeCreateAppointment } from '@/app/create-appointment';
import { makeGetAppointment } from '@/app/get-appointment';
import { config } from '@/infra/config';
import { repositories } from '@/infra/repositories';

export const createAppointment = makeCreateAppointment({
  clinics: repositories.clinics,
  patients: repositories.patients,
  appointments: repositories.appointments,
  quietHours: config.quietHours,
});
export const getAppointment = makeGetAppointment({ appointments: repositories.appointments });
