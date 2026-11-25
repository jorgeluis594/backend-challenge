import type { AppointmentRepository } from '@/app/ports';
import type { Appointment, AppointmentId } from '@/domain/appointment';
import { fail, ok, type Result } from '@/shared/result';

export type GetAppointmentInput = Readonly<{ id: AppointmentId }>;
export type GetAppointmentError = 'APPOINTMENT_NOT_FOUND';
export type GetAppointmentDeps = Readonly<{ appointments: AppointmentRepository }>;

export const makeGetAppointment =
  (deps: GetAppointmentDeps) =>
  async (input: GetAppointmentInput): Promise<Result<Appointment, GetAppointmentError>> => {
    const appointment = await deps.appointments.findById(input);
    if (!appointment) return fail('APPOINTMENT_NOT_FOUND');
    return ok(appointment);
  };
