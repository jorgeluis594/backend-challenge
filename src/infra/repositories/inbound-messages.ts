import type { Prisma } from '@prisma/client';
import type { InboundMessageRepository } from '@/app/ports';

export const makeInboundMessageRepository = (_db: Prisma.TransactionClient): InboundMessageRepository => ({
  insertIfNew: async () => {
    throw new Error('not implemented');
  },
});
