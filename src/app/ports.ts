import type { Appointment, AppointmentId, AppointmentStatus } from '@/domain/appointment';
import type { Clinic, ClinicId, Timezone } from '@/domain/clinic';
import type { InboundMessage } from '@/domain/inbound-message';
import type { Patient, PatientId, Phone } from '@/domain/patient';
import type { ReminderId, ReminderPlan, ReminderSettlement, SendOutcome } from '@/domain/reminder';

export type ClinicRepository = Readonly<{
  create(input: { name: string; timezone: Timezone }): Promise<Clinic>;
  findById(input: { id: ClinicId }): Promise<Clinic | null>;
}>;

export type PatientRepository = Readonly<{
  create(input: { clinicId: ClinicId; name: string; phone: Phone | null; acceptsReminders: boolean }): Promise<Patient>;
  findById(input: { id: PatientId }): Promise<Patient | null>;
}>;

export type AppointmentRepository = Readonly<{
  /** Inserts the appointment and its first reminder atomically. */
  create(input: { clinicId: ClinicId; patientId: PatientId; startsAt: Date; reminder: ReminderPlan }): Promise<Appointment>;
  findById(input: { id: AppointmentId }): Promise<Appointment | null>;
  update(input: { id: AppointmentId; startsAt?: Date; status?: AppointmentStatus }): Promise<void>;
  /** The appointment that received the most recently SENT reminder to that phone
      (reminders with status 'sent', ORDER BY sent_at DESC, seq DESC, LIMIT 1), among appointments
      that are not cancelled and start after `at`. */
  findLastRemindedByPhone(input: { phone: string; at: Date }): Promise<{ id: AppointmentId } | null>;
}>;

/** A pending reminder with everything needed to decide and send it. */
export type DueReminder = Readonly<{
  id: ReminderId;
  attempts: number;
  appointment: Readonly<{ startsAt: Date }>;
  patient: Readonly<{ name: string; phone: Phone | null; acceptsReminders: boolean }>;
  clinic: Readonly<{ name: string; timezone: Timezone }>;
}>;

export type ReminderRepository = Readonly<{
  create(input: { appointmentId: AppointmentId; plan: ReminderPlan }): Promise<void>;
  /** pending → cancelled for that appointment. No-op when there is none. */
  cancelPending(input: { appointmentId: AppointmentId }): Promise<void>;
  /** Every pending reminder with next_attempt_at <= at (ORDER BY next_attempt_at, seq),
      each with its appointment, patient and clinic. */
  findDue(input: { at: Date }): Promise<readonly DueReminder[]>;
  /** Reserves one attempt: only if the reminder is still pending with exactly `attempts`,
      sets attempts + 1 and next_attempt_at = `until`. false when another pass got it first. */
  claim(input: { id: ReminderId; attempts: number; until: Date }): Promise<boolean>;
  /** Writes only if the reminder is still pending (WHERE status = 'pending'). */
  settle(input: { id: ReminderId; settlement: ReminderSettlement }): Promise<void>;
}>;

export type InboundMessageRepository = Readonly<{
  /** false when that messageId was already stored. */
  insertIfNew(input: InboundMessage): Promise<boolean>;
}>;

/** Runs `work` in one database transaction. Every repository call made inside `work` joins it. */
export type Transaction = <T>(work: () => Promise<T>) => Promise<T>;

export type ProviderClient = Readonly<{
  sendMessage(input: { to: Phone; text: string; idempotencyKey: ReminderId }): Promise<SendOutcome>;
}>;
