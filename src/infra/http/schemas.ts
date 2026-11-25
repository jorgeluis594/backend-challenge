import { IANAZone } from 'luxon';
import { z } from 'zod';
import type { AppointmentId } from '@/domain/appointment';
import type { ClinicId, Timezone } from '@/domain/clinic';
import type { PatientId, Phone } from '@/domain/patient';

const E164 = /^\+[1-9]\d{7,14}$/;

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const name = z.string().min(1);
const timezone = z
  .string()
  .refine((zone) => IANAZone.isValidZone(zone), 'Unknown IANA timezone')
  .transform((zone) => zone as Timezone);
const phone = z
  .string()
  .regex(E164, 'Phone must be E.164')
  .transform((value) => value as Phone);

/** Ids that fail these answer 404, like a missing entity, so bodies carry them as plain strings. */
export const clinicIdSchema = z.uuid().transform((id) => id as ClinicId);
export const patientIdSchema = z.uuid().transform((id) => id as PatientId);
export const appointmentIdSchema = z.uuid().transform((id) => id as AppointmentId);

export const createClinicSchema = z.object({ name, timezone });

export const createPatientSchema = z.object({
  clinicId: z.string(),
  name,
  phone: phone.nullable().default(null),
  acceptsReminders: z.boolean(),
});

export const createAppointmentSchema = z.object({
  clinicId: z.string(),
  patientId: z.string(),
  startsAt: instant,
});

export const rescheduleAppointmentSchema = z.object({ startsAt: instant });

export const inboundMessageSchema = z.object({
  messageId: z.string(),
  from: z.string(),
  text: z.string(),
  receivedAt: instant,
});

export const setClockSchema = z.object({ now: instant });
