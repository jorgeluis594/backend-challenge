import { makeRunReminderPass } from '@/app/run-reminder-pass';
import { config } from '@/infra/config';
import { provider } from '@/infra/provider/client';
import { reminderRepository } from '@/infra/repositories/reminders';

export const runReminderPass = makeRunReminderPass({
  reminders: reminderRepository,
  provider,
  quietHours: config.quietHours,
});
