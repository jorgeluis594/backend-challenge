import { DateTime } from 'luxon';
import type { Timezone } from '@/domain/clinic';

export type ReminderTextInput = Readonly<{
  patientName: string;
  clinicName: string;
  startsAt: Date;
  timezone: Timezone;
}>;

/** The exact text of rule 7, with the date and time local to the clinic. */
export function reminderText(input: ReminderTextInput): string {
  const start = DateTime.fromJSDate(input.startsAt, { zone: input.timezone });
  return `Hola ${input.patientName}, te recordamos tu cita en ${input.clinicName} el ${start.toFormat('dd/MM/yyyy')} a las ${start.toFormat('HH:mm')}. Responde SI para confirmar o NO para cancelar.`;
}
