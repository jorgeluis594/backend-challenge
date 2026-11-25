import type { Prisma } from '@prisma/client';
import type { AppointmentRepository } from '@/app/ports';

export const makeAppointmentRepository = (_db: Prisma.TransactionClient): AppointmentRepository => ({
  create: async () => {
    throw new Error('not implemented');
  },
  findById: async () => {
    throw new Error('not implemented');
  },
  update: async () => {
    throw new Error('not implemented');
  },
  findLastRemindedByPhone: async () => {
    throw new Error('not implemented');
  },
});
