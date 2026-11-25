import { DateTime } from 'luxon';
import type { Timezone } from '@/domain/clinic';
import type { QuietHours, ReminderPlan } from '@/domain/reminder';

export type PlanReminderInput = Readonly<{
  startsAt: Date;
  timezone: Timezone;
  notBefore: Date;
  quietHours: QuietHours;
}>;

/** When the reminder goes out (rules 2 to 5 of the statement). */
export function planReminder(input: PlanReminderInput): ReminderPlan {
  const start = DateTime.fromJSDate(input.startsAt, { zone: input.timezone });
  const earliest = DateTime.fromJSDate(input.notBefore, { zone: input.timezone });
  // Calendar day, not 24 h: across a DST change the local time stays the same.
  const dayBefore = outOfQuietHours(start.minus({ days: 1 }), input.quietHours);
  const at = laterOf(dayBefore, outOfQuietHours(earliest, input.quietHours));
  const scheduledFor = at.toJSDate();
  if (at < start) return { status: 'pending', scheduledFor };
  return { status: 'skipped', scheduledFor, skipReason: 'too_late' };
}

function laterOf(a: DateTime, b: DateTime): DateTime {
  if (a < b) return b;
  return a;
}

function outOfQuietHours(t: DateTime, quietHours: QuietHours): DateTime {
  if (!isQuiet(t.hour, quietHours)) return t;
  const end = t.set({ hour: quietHours.until, minute: 0, second: 0, millisecond: 0 });
  const endsNextDay = quietHours.from > quietHours.until && t.hour >= quietHours.from;
  if (endsNextDay) return end.plus({ days: 1 });
  return end;
}

function isQuiet(hour: number, { from, until }: QuietHours): boolean {
  if (from > until) return hour >= from || hour < until; // the period crosses midnight
  return hour >= from && hour < until;
}
