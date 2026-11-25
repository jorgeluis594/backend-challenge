import { parseReply } from '@/app/parse-reply';
import type { AppointmentRepository, InboundMessageRepository, ReminderRepository, Transaction } from '@/app/ports';
import type { InboundMessage } from '@/domain/inbound-message';
import { now } from '@/infra/clock';

export type HandleInboundMessageInput = InboundMessage;
export type HandleInboundMessageDeps = Readonly<{
  transaction: Transaction;
  inboundMessages: InboundMessageRepository;
  appointments: AppointmentRepository;
  reminders: ReminderRepository;
}>;

/** The message is stored in the same transaction that applies it, so a failure lets the provider's retry apply it again. */
export const makeHandleInboundMessage =
  (deps: HandleInboundMessageDeps) =>
  (input: HandleInboundMessageInput): Promise<'applied' | 'duplicate' | 'ignored'> =>
    deps.transaction(async () => {
      const { inboundMessages, appointments, reminders } = deps;
      if (!(await inboundMessages.insertIfNew(input))) return 'duplicate';
      const reply = parseReply(input.text);
      if (!reply) return 'ignored';
      const target = await appointments.findLastRemindedByPhone({ phone: input.from, at: now() });
      if (!target) return 'ignored';
      return appointments.withLock({ id: target.id }, async (appointment) => {
        if (!appointment || appointment.status === 'cancelled') return 'ignored';
        if (reply === 'confirm') {
          await appointments.update({ id: target.id, status: 'confirmed' });
          return 'applied';
        }
        await reminders.cancelPending({ appointmentId: target.id });
        await appointments.update({ id: target.id, status: 'cancelled' });
        return 'applied';
      });
    });
