import type { Phone } from '@/domain/patient';
import type { SendDecision } from '@/domain/reminder';

export type DecideSendInput = Readonly<{
  startsAt: Date;
  phone: Phone | null;
  acceptsReminders: boolean;
  at: Date;
}>;

/** Send or skip, right before each attempt (rules 5 and 6 of the statement). */
export function decideSend(input: DecideSendInput): SendDecision {
  if (input.at >= input.startsAt) return { action: 'skip', reason: 'too_late' };
  if (input.phone === null) return { action: 'skip', reason: 'no_phone' };
  if (!input.acceptsReminders) return { action: 'skip', reason: 'opted_out' };
  return { action: 'send', to: input.phone };
}
