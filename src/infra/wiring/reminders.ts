import { makeRunReminderPass } from '@/app/run-reminder-pass';
import { provider } from '@/infra/provider/client';
import { repositories } from '@/infra/repositories';

export const runReminderPass = makeRunReminderPass({ reminders: repositories.reminders, provider });
