import { makeCancelAppointment } from '@/app/cancel-appointment';
import { makeCreateAppointment } from '@/app/create-appointment';
import { makeGetAppointment } from '@/app/get-appointment';
import { makeRescheduleAppointment } from '@/app/reschedule-appointment';
import { config } from '@/infra/config';
import { repositories, transaction } from '@/infra/repositories';

export const createAppointment = makeCreateAppointment({
  clinics: repositories.clinics,
  patients: repositories.patients,
  appointments: repositories.appointments,
  quietHours: config.quietHours,
});
export const getAppointment = makeGetAppointment({ appointments: repositories.appointments });
export const rescheduleAppointment = makeRescheduleAppointment({ transaction, quietHours: config.quietHours });
export const cancelAppointment = makeCancelAppointment({ transaction });
