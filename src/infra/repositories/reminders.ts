import type { Prisma } from '@prisma/client';
import type { ReminderRepository } from '@/app/ports';
import type { Timezone } from '@/domain/clinic';
import type { Phone } from '@/domain/patient';
import type { ReminderId } from '@/domain/reminder';

export const makeReminderRepository = (db: Prisma.TransactionClient): ReminderRepository => ({
  create: async ({ appointmentId, plan }) => {
    await db.reminder.create({ data: { ...plan, appointmentId, nextAttemptAt: plan.scheduledFor } });
  },
  cancelPending: async ({ appointmentId }) => {
    await db.reminder.updateMany({ where: { appointmentId, status: 'pending' }, data: { status: 'cancelled' } });
  },
  findDue: async ({ at }) => {
    const rows = await db.reminder.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: at } },
      orderBy: [{ nextAttemptAt: 'asc' }, { seq: 'asc' }],
      include: { appointment: { include: { patient: true, clinic: true } } },
    });
    return rows.map(({ id, attempts, appointment: { startsAt, patient, clinic } }) => ({
      id: id as ReminderId,
      attempts,
      appointment: { startsAt },
      patient: { name: patient.name, phone: patient.phone as Phone | null, acceptsReminders: patient.acceptsReminders },
      clinic: { name: clinic.name, timezone: clinic.timezone as Timezone },
    }));
  },
  claim: async ({ id, attempts, until }) => {
    const { count } = await db.reminder.updateMany({
      where: { id, status: 'pending', attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: until },
    });
    return count === 1;
  },
  settle: async ({ id, settlement }) => {
    await db.reminder.updateMany({ where: { id, status: 'pending' }, data: settlement });
  },
});
