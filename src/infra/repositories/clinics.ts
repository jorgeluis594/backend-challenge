import type { Prisma } from '@prisma/client';
import type { ClinicRepository } from '@/app/ports';

export const makeClinicRepository = (_db: Prisma.TransactionClient): ClinicRepository => ({
  create: async () => {
    throw new Error('not implemented');
  },
  findById: async () => {
    throw new Error('not implemented');
  },
});
