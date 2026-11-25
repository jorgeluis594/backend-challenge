import type { Phone } from '@/domain/patient';

export type ReminderId = string & { readonly __brand: 'ReminderId' }; // also the provider Idempotency-Key
export type SkipReason = 'too_late' | 'no_phone' | 'opted_out';

type ReminderBase = Readonly<{ id: ReminderId; scheduledFor: Date; attempts: number }>;
export type Reminder = ReminderBase &
  (
    | Readonly<{ status: 'pending' | 'failed' | 'cancelled'; sentAt: null; skipReason: null }>
    | Readonly<{ status: 'sent'; sentAt: Date; skipReason: null }>
    | Readonly<{ status: 'skipped'; sentAt: null; skipReason: SkipReason }>
  );
export type ReminderStatus = Reminder['status'];

export type QuietHours = Readonly<{ from: number; until: number }>; // local clinic hours, 0–23

/** How a reminder is born. */
export type ReminderPlan =
  | Readonly<{ status: 'pending'; scheduledFor: Date }>
  | Readonly<{ status: 'skipped'; scheduledFor: Date; skipReason: 'too_late' }>;

/** What to do right before calling the provider. */
export type SendDecision =
  | Readonly<{ action: 'send'; to: Phone }>
  | Readonly<{ action: 'skip'; reason: SkipReason }>;

/** What the provider answered. */
export type SendOutcome = 'delivered' | 'rejected' | 'not_delivered' | 'unknown';

/** How a reminder ends a pass. Also what the repository stores. */
export type ReminderSettlement =
  | Readonly<{ status: 'sent'; attempts: number; sentAt: Date }>
  | Readonly<{ status: 'failed'; attempts: number }>
  | Readonly<{ status: 'pending'; attempts: number; nextAttemptAt: Date }>
  | Readonly<{ status: 'skipped'; skipReason: SkipReason }>;
