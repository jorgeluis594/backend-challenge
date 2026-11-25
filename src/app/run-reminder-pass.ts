import { DateTime } from 'luxon';
import { afterAttempt } from '@/app/after-attempt';
import { decideSend } from '@/app/decide-send';
import type { DueReminder, ProviderClient, ReminderRepository } from '@/app/ports';
import { reminderText } from '@/app/reminder-text';
import { now } from '@/infra/clock';

export type RunReminderPassDeps = Readonly<{ reminders: ReminderRepository; provider: ProviderClient }>;

/** How long a claimed attempt stays out of other passes: longer than the 5 s provider timeout. */
const CLAIM_MINUTES = 1;

export const makeRunReminderPass = (deps: RunReminderPassDeps) => {
  /** false when another pass claimed this attempt first. */
  const sendReminder = async (reminder: DueReminder): Promise<boolean> => {
    const { id, attempts, appointment, patient, clinic } = reminder;
    const decision = decideSend({
      startsAt: appointment.startsAt,
      phone: patient.phone,
      acceptsReminders: patient.acceptsReminders,
      at: now(),
    });
    if (decision.action === 'skip') {
      await deps.reminders.settle({ id, settlement: { status: 'skipped', skipReason: decision.reason } });
      return true;
    }
    const until = DateTime.fromJSDate(now()).plus({ minutes: CLAIM_MINUTES }).toJSDate();
    const claimed = await deps.reminders.claim({ id, attempts, until });
    if (!claimed) return false;
    const outcome = await deps.provider.sendMessage({
      to: decision.to,
      text: reminderText({ patientName: patient.name, clinicName: clinic.name, startsAt: appointment.startsAt, timezone: clinic.timezone }),
      idempotencyKey: id,
    });
    await deps.reminders.settle({ id, settlement: afterAttempt({ outcome, attempt: attempts + 1, attemptedAt: now() }) });
    return true;
  };

  return async (): Promise<{ processed: number }> => {
    let processed = 0;
    for (const reminder of await deps.reminders.findDue({ at: now() })) {
      if (await sendReminder(reminder)) processed += 1;
    }
    return { processed };
  };
};
