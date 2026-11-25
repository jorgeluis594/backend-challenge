import { parseReply } from '@/app/parse-reply';
import type { Transaction } from '@/app/ports';
import type { InboundMessage } from '@/domain/inbound-message';
import { now } from '@/infra/clock';

export type HandleInboundMessageInput = InboundMessage;
export type HandleInboundMessageDeps = Readonly<{ transaction: Transaction }>;

/** The message is stored in the same transaction that applies it, so a failure lets the provider's retry apply it again. */
export const makeHandleInboundMessage =
  (deps: HandleInboundMessageDeps) =>
  (input: HandleInboundMessageInput): Promise<'applied' | 'duplicate' | 'ignored'> =>
    deps.transaction(async ({ inboundMessages, appointments, reminders }) => {
      if (!(await inboundMessages.insertIfNew(input))) return 'duplicate';
      const reply = parseReply(input.text);
      if (!reply) return 'ignored';
      const appointment = await appointments.findLastRemindedByPhone({ phone: input.from, at: now() });
      if (!appointment) return 'ignored';
      if (reply === 'confirm') {
        await appointments.update({ id: appointment.id, status: 'confirmed' });
        return 'applied';
      }
      await reminders.cancelPending({ appointmentId: appointment.id });
      await appointments.update({ id: appointment.id, status: 'cancelled' });
      return 'applied';
    });
