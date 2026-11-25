import type { AppointmentRepository, ReminderRepository, Transaction } from '@/app/ports';
import type { Appointment, AppointmentId } from '@/domain/appointment';
import { fail, ok, type Result } from '@/shared/result';

export type CancelAppointmentInput = Readonly<{ id: AppointmentId }>;
export type CancelAppointmentError = 'APPOINTMENT_NOT_FOUND';
export type CancelAppointmentDeps = Readonly<{
  transaction: Transaction;
  appointments: AppointmentRepository;
  reminders: ReminderRepository;
}>;

export const makeCancelAppointment =
  (deps: CancelAppointmentDeps) =>
  (input: CancelAppointmentInput): Promise<Result<Appointment, CancelAppointmentError>> =>
    deps.transaction(async () => {
      const { appointments, reminders } = deps;
      const appointment = await appointments.findById(input);
      if (!appointment) return fail('APPOINTMENT_NOT_FOUND');
      if (appointment.status === 'cancelled') return ok(appointment);
      await reminders.cancelPending({ appointmentId: input.id });
      await appointments.update({ id: input.id, status: 'cancelled' });
      const cancelled = await appointments.findById(input);
      if (!cancelled) throw new Error(`Appointment ${input.id} vanished inside its own transaction`);
      return ok(cancelled);
    });
