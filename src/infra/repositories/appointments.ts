import type { $Enums, Prisma } from '@prisma/client';
import type { AppointmentRepository } from '@/app/ports';
import type { Appointment, AppointmentId } from '@/domain/appointment';
import type { ClinicId } from '@/domain/clinic';
import type { PatientId } from '@/domain/patient';
import type { Reminder, ReminderId, SkipReason } from '@/domain/reminder';

type ReminderRow = Readonly<{
  id: string;
  scheduledFor: Date;
  attempts: number;
  status: $Enums.ReminderStatus;
  sentAt: Date | null;
  skipReason: $Enums.SkipReason | null;
}>;

type AppointmentRow = Readonly<{
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: Date;
  status: $Enums.AppointmentStatus;
  reminders: readonly ReminderRow[];
}>;

const withReminders = { reminders: { orderBy: { seq: 'asc' } } } as const;

const toReminder = (row: ReminderRow): Reminder => {
  const base = { id: row.id as ReminderId, scheduledFor: row.scheduledFor, attempts: row.attempts };
  switch (row.status) {
    case 'sent':
      return { ...base, status: row.status, sentAt: row.sentAt as Date, skipReason: null };
    case 'skipped':
      return { ...base, status: row.status, sentAt: null, skipReason: row.skipReason as SkipReason };
    case 'pending':
    case 'failed':
    case 'cancelled':
      return { ...base, status: row.status, sentAt: null, skipReason: null };
    default: {
      const unknownStatus: never = row.status;
      throw new Error(`Unknown reminder status ${String(unknownStatus)}`);
    }
  }
};

const toAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id as AppointmentId,
  clinicId: row.clinicId as ClinicId,
  patientId: row.patientId as PatientId,
  startsAt: row.startsAt,
  status: row.status,
  reminders: row.reminders.map(toReminder),
});

export const makeAppointmentRepository = (db: Prisma.TransactionClient): AppointmentRepository => ({
  create: async ({ reminder, ...appointment }) =>
    toAppointment(
      await db.appointment.create({
        data: { ...appointment, reminders: { create: { ...reminder, nextAttemptAt: reminder.scheduledFor } } },
        include: withReminders,
      }),
    ),
  findById: async ({ id }) => {
    const row = await db.appointment.findUnique({ where: { id }, include: withReminders });
    if (!row) return null;
    return toAppointment(row);
  },
  update: async ({ id, ...changes }) => {
    await db.appointment.update({ where: { id }, data: changes });
  },
  findLastRemindedByPhone: async () => {
    throw new Error('not implemented');
  },
});
