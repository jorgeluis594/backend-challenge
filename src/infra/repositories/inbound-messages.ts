import type { Prisma } from '@prisma/client';
import type { InboundMessageRepository } from '@/app/ports';

export const makeInboundMessageRepository = (db: Prisma.TransactionClient): InboundMessageRepository => ({
  insertIfNew: async ({ messageId, from, text, receivedAt }) => {
    const inserted = await db.inboundMessage.createMany({
      data: [{ messageId, fromPhone: from, text, receivedAt }],
      skipDuplicates: true,
    });
    return inserted.count === 1;
  },
});
