import type { Transaction } from '@/app/ports';
import { planReminder } from '@/app/plan-reminder';
import type { Appointment, AppointmentId } from '@/domain/appointment';
import type { QuietHours } from '@/domain/reminder';
import { now } from '@/infra/clock';
import { fail, ok, type Result } from '@/shared/result';

export type RescheduleAppointmentInput = Readonly<{ id: AppointmentId; startsAt: Date }>;
export type RescheduleAppointmentError =
  | 'APPOINTMENT_NOT_FOUND'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_STARTED'
  | 'STARTS_AT_NOT_FUTURE';
export type RescheduleAppointmentDeps = Readonly<{ transaction: Transaction; quietHours: QuietHours }>;

export const makeRescheduleAppointment =
  (deps: RescheduleAppointmentDeps) =>
  (input: RescheduleAppointmentInput): Promise<Result<Appointment, RescheduleAppointmentError>> =>
    deps.transaction(async ({ appointments, reminders, clinics }) => {
      const at = now();
      const appointment = await appointments.findById({ id: input.id });
      if (!appointment) return fail('APPOINTMENT_NOT_FOUND');
      if (appointment.status === 'cancelled') return fail('APPOINTMENT_CANCELLED');
      if (appointment.startsAt <= at) return fail('APPOINTMENT_STARTED');
      if (input.startsAt <= at) return fail('STARTS_AT_NOT_FUTURE');
      // Rule 1: the same time again must not create a second reminder.
      if (input.startsAt.getTime() === appointment.startsAt.getTime()) return ok(appointment);

      await reminders.cancelPending({ appointmentId: input.id });
      await appointments.update({ id: input.id, startsAt: input.startsAt, status: 'scheduled' });
      const clinic = await clinics.findById({ id: appointment.clinicId });
      if (!clinic) throw new Error(`Clinic ${appointment.clinicId} of appointment ${input.id} not found`);
      const plan = planReminder({ startsAt: input.startsAt, timezone: clinic.timezone, notBefore: at, quietHours: deps.quietHours });
      await reminders.create({ appointmentId: input.id, plan });

      const rescheduled = await appointments.findById({ id: input.id });
      if (!rescheduled) throw new Error(`Appointment ${input.id} vanished inside its own transaction`);
      return ok(rescheduled);
    });
