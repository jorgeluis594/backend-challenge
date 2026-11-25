import type { Prisma } from '@prisma/client';
import type { ReminderRepository } from '@/app/ports';

export const makeReminderRepository = (db: Prisma.TransactionClient): ReminderRepository => ({
  create: async ({ appointmentId, plan }) => {
    await db.reminder.create({ data: { ...plan, appointmentId, nextAttemptAt: plan.scheduledFor } });
  },
  cancelPending: async ({ appointmentId }) => {
    await db.reminder.updateMany({ where: { appointmentId, status: 'pending' }, data: { status: 'cancelled' } });
  },
  findDue: async () => {
    throw new Error('not implemented');
  },
  settle: async () => {
    throw new Error('not implemented');
  },
});
