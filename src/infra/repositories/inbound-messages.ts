import type { InboundMessageRepository } from '@/app/ports';
import { db } from '@/infra/db';

export const inboundMessageRepository: InboundMessageRepository = {
  insertIfNew: async ({ messageId, from, text, receivedAt }) => {
    const inserted = await db().inboundMessage.createMany({
      data: [{ messageId, fromPhone: from, text, receivedAt }],
      skipDuplicates: true,
    });
    return inserted.count === 1;
  },
};
