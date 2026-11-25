import { AsyncLocalStorage } from 'node:async_hooks';
import { type Prisma, PrismaClient } from '@prisma/client';
import type { Transaction } from '@/app/ports';

const prisma = new PrismaClient();
const activeTransaction = new AsyncLocalStorage<Prisma.TransactionClient>();

/** The client of the transaction this call runs in, or the plain client outside one. */
export const db = () => activeTransaction.getStore() ?? prisma;

export const transaction: Transaction = (work) => {
  if (activeTransaction.getStore()) return work();
  return prisma.$transaction((tx) => activeTransaction.run(tx, work));
};
