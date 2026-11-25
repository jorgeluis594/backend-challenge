import { DateTime } from 'luxon';
import { afterAttempt } from '@/app/after-attempt';
import { decideSend } from '@/app/decide-send';
import { planReminder } from '@/app/plan-reminder';
import type { DueReminder, ProviderClient, ReminderRepository } from '@/app/ports';
import { reminderText } from '@/app/reminder-text';
import type { QuietHours } from '@/domain/reminder';
import { now } from '@/infra/clock';

export type RunReminderPassDeps = Readonly<{
  reminders: ReminderRepository;
  provider: ProviderClient;
  quietHours: QuietHours;
}>;

/** How long a claimed attempt stays out of other passes: longer than the 5 s provider timeout. */
const CLAIM_MINUTES = 1;

export const makeRunReminderPass = (deps: RunReminderPassDeps) => {
  /** false when it does not count as processed: another pass claimed it, or it waits for quiet hours to end. */
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
    if (attempts === 0) {
      // A late pass can reach a first attempt inside quiet hours; retries do not wait.
      const plan = planReminder({
        startsAt: appointment.startsAt,
        timezone: clinic.timezone,
        notBefore: now(),
        quietHours: deps.quietHours,
      });
      if (plan.status === 'skipped') {
        await deps.reminders.settle({ id, settlement: { status: 'skipped', skipReason: plan.skipReason } });
        return true;
      }
      if (plan.scheduledFor > now()) {
        await deps.reminders.settle({ id, settlement: { status: 'pending', attempts: 0, nextAttemptAt: plan.scheduledFor } });
        return false;
      }
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
