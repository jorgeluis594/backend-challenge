import { makeRunReminderPass } from '@/app/run-reminder-pass';
import { provider } from '@/infra/provider/client';
import { reminderRepository } from '@/infra/repositories/reminders';

export const runReminderPass = makeRunReminderPass({ reminders: reminderRepository, provider });
