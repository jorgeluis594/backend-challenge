import { z } from 'zod';
import type { QuietHours } from '@/domain/reminder';

const hourOfDay = z.coerce.number().int().min(0).max(23);

const environment = z
  .object({
    DATABASE_URL: z.string().min(1),
    PROVIDER_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    CLOCK_MODE: z.literal('test').optional(),
    QUIET_HOURS_FROM: hourOfDay.default(21),
    QUIET_HOURS_UNTIL: hourOfDay.default(9),
  })
  .parse(process.env);

const quietHours: QuietHours = { from: environment.QUIET_HOURS_FROM, until: environment.QUIET_HOURS_UNTIL };

export const config = {
  providerUrl: environment.PROVIDER_URL,
  port: environment.PORT,
  testClock: environment.CLOCK_MODE === 'test',
  quietHours,
};
