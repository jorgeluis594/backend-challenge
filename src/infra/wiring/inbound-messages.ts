import { makeHandleInboundMessage } from '@/app/handle-inbound-message';
import { transaction } from '@/infra/db';
import { appointmentRepository } from '@/infra/repositories/appointments';
import { inboundMessageRepository } from '@/infra/repositories/inbound-messages';
import { reminderRepository } from '@/infra/repositories/reminders';

export const handleInboundMessage = makeHandleInboundMessage({
  transaction,
  inboundMessages: inboundMessageRepository,
  appointments: appointmentRepository,
  reminders: reminderRepository,
});
