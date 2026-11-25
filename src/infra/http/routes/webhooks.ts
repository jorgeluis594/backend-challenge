import { Router } from 'express';
import { sendInvalidBody } from '@/infra/http/errors';
import { inboundMessageSchema } from '@/infra/http/schemas';
import { handleInboundMessage } from '@/infra/wiring/inbound-messages';

export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/inbound-messages', async (req, res) => {
  const body = inboundMessageSchema.safeParse(req.body);
  if (!body.success) return sendInvalidBody(res, body.error);
  const outcome = await handleInboundMessage(body.data);
  res.json({ outcome });
});
