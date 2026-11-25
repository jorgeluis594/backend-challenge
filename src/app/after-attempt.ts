import { DateTime } from 'luxon';
import type { ReminderSettlement, SendOutcome } from '@/domain/reminder';

export type AfterAttemptInput = Readonly<{
  outcome: SendOutcome;
  /** The attempt just made: 1, 2 or 3. */
  attempt: number;
  attemptedAt: Date;
}>;

/** What happens to a reminder after a provider call. Retries ignore quiet hours. */
export function afterAttempt({ outcome, attempt, attemptedAt }: AfterAttemptInput): ReminderSettlement {
  switch (outcome) {
    case 'delivered':
      return { status: 'sent', attempts: attempt, sentAt: attemptedAt };
    case 'rejected':
      return { status: 'failed', attempts: attempt };
    case 'not_delivered':
    case 'unknown':
      return retry(attempt, attemptedAt);
    default: {
      const unexpected: never = outcome;
      throw new Error(`Unexpected send outcome: ${String(unexpected)}`);
    }
  }
}

function retry(attempt: number, attemptedAt: Date): ReminderSettlement {
  const delayMinutes = retryDelayMinutes(attempt);
  if (delayMinutes === null) return { status: 'failed', attempts: attempt };
  const nextAttemptAt = DateTime.fromJSDate(attemptedAt).plus({ minutes: delayMinutes }).toJSDate();
  return { status: 'pending', attempts: attempt, nextAttemptAt };
}

/** The second attempt goes 1 minute after the first failure, the third 5 minutes after the second. */
function retryDelayMinutes(attempt: number): number | null {
  if (attempt === 1) return 1;
  if (attempt === 2) return 5;
  return null;
}
