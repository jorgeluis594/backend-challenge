import type { AppointmentRepository, ReminderRepository } from '@/app/ports';
import type { Appointment, AppointmentId } from '@/domain/appointment';
import { fail, ok, type Result } from '@/shared/result';

export type CancelAppointmentInput = Readonly<{ id: AppointmentId }>;
export type CancelAppointmentError = 'APPOINTMENT_NOT_FOUND';
export type CancelAppointmentDeps = Readonly<{
  appointments: AppointmentRepository;
  reminders: ReminderRepository;
}>;

export const makeCancelAppointment =
  (deps: CancelAppointmentDeps) =>
  (input: CancelAppointmentInput): Promise<Result<Appointment, CancelAppointmentError>> =>
    deps.appointments.withLock(input, async (appointment) => {
      const { appointments, reminders } = deps;
      if (!appointment) return fail('APPOINTMENT_NOT_FOUND');
      if (appointment.status === 'cancelled') return ok(appointment);
      await reminders.cancelPending({ appointmentId: input.id });
      await appointments.update({ id: input.id, status: 'cancelled' });
      const cancelled = await appointments.findById(input);
      if (!cancelled) throw new Error(`Appointment ${input.id} vanished inside its own transaction`);
      return ok(cancelled);
    });
