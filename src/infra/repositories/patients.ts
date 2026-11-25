import type { Prisma } from '@prisma/client';
import type { PatientRepository } from '@/app/ports';

export const makePatientRepository = (_db: Prisma.TransactionClient): PatientRepository => ({
  create: async () => {
    throw new Error('not implemented');
  },
  findById: async () => {
    throw new Error('not implemented');
  },
});
