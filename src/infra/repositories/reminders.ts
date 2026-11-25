import type { Prisma } from '@prisma/client';
import type { ReminderRepository } from '@/app/ports';

export const makeReminderRepository = (_db: Prisma.TransactionClient): ReminderRepository => ({
  create: async () => {
    throw new Error('not implemented');
  },
  cancelPending: async () => {
    throw new Error('not implemented');
  },
  findDue: async () => {
    throw new Error('not implemented');
  },
  settle: async () => {
    throw new Error('not implemented');
  },
});
