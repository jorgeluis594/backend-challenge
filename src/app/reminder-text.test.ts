import { describe, expect, test } from 'vitest';
import { reminderText } from '@/app/reminder-text';
import type { Timezone } from '@/domain/clinic';

const MADRID = 'Europe/Madrid' as Timezone;
const CANARY = 'Atlantic/Canary' as Timezone;

// Madrid is UTC+1 in winter and UTC+2 in summer; the Canaries are UTC+0 and UTC+1.
// In 2027 the clocks go forward on Sunday 28 March and back on Sunday 31 October.

describe('the reminder text is exactly the one in the statement, with the date and time local to the clinic', () => {
  test.each([
    {
      title: 'a winter appointment in Madrid at 10:00 on 17/02/2027 (09:00 UTC)',
      patientName: 'María José',
      clinicName: 'Clínica Dental Sonrisa',
      startsAt: new Date('2027-02-17T09:00:00Z'),
      timezone: MADRID,
      expected:
        'Hola María José, te recordamos tu cita en Clínica Dental Sonrisa el 17/02/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: 'a summer appointment in Madrid at 17:30 on 14/07/2027 (15:30 UTC)',
      patientName: 'Lucía',
      clinicName: 'Fisioterapia Centro',
      startsAt: new Date('2027-07-14T15:30:00Z'),
      timezone: MADRID,
      expected:
        'Hola Lucía, te recordamos tu cita en Fisioterapia Centro el 14/07/2027 a las 17:30. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: 'day, month and hour below ten are written with a leading zero: 09:05 on 05/03/2027 in Madrid',
      patientName: 'Pedro',
      clinicName: 'Clínica Norte',
      startsAt: new Date('2027-03-05T08:05:00Z'),
      timezone: MADRID,
      expected:
        'Hola Pedro, te recordamos tu cita en Clínica Norte el 05/03/2027 a las 09:05. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: '23:30 UTC on 16/02/2027 is already 00:30 on 17/02 in Madrid',
      patientName: 'Ana',
      clinicName: 'Clínica Sur',
      startsAt: new Date('2027-02-16T23:30:00Z'),
      timezone: MADRID,
      expected:
        'Hola Ana, te recordamos tu cita en Clínica Sur el 17/02/2027 a las 00:30. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: '22:15 UTC on 31/07/2027 is already 00:15 on 01/08 in Madrid summer time',
      patientName: 'Ana',
      clinicName: 'Clínica Sur',
      startsAt: new Date('2027-07-31T22:15:00Z'),
      timezone: MADRID,
      expected:
        'Hola Ana, te recordamos tu cita en Clínica Sur el 01/08/2027 a las 00:15. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: '23:15 UTC on 31/12/2027 is already 00:15 on 01/01/2028 in Madrid',
      patientName: 'Ana',
      clinicName: 'Clínica Sur',
      startsAt: new Date('2027-12-31T23:15:00Z'),
      timezone: MADRID,
      expected:
        'Hola Ana, te recordamos tu cita en Clínica Sur el 01/01/2028 a las 00:15. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: 'a winter appointment in Las Palmas at 10:00 Canary time on 17/02/2027 (10:00 UTC)',
      patientName: 'Carmen',
      clinicName: 'Clínica Las Palmas',
      startsAt: new Date('2027-02-17T10:00:00Z'),
      timezone: CANARY,
      expected:
        'Hola Carmen, te recordamos tu cita en Clínica Las Palmas el 17/02/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: 'the instant that is 17:30 in Madrid in summer is 16:30 in Las Palmas, one hour behind',
      patientName: 'Carmen',
      clinicName: 'Clínica Las Palmas',
      startsAt: new Date('2027-07-14T15:30:00Z'),
      timezone: CANARY,
      expected:
        'Hola Carmen, te recordamos tu cita en Clínica Las Palmas el 14/07/2027 a las 16:30. Responde SI para confirmar o NO para cancelar.',
    },
    {
      title: '23:30 UTC on 16/02/2027 is still 23:30 on 16/02 in Las Palmas, while in Madrid it is already the 17th',
      patientName: 'Carmen',
      clinicName: 'Clínica Las Palmas',
      startsAt: new Date('2027-02-16T23:30:00Z'),
      timezone: CANARY,
      expected:
        'Hola Carmen, te recordamos tu cita en Clínica Las Palmas el 16/02/2027 a las 23:30. Responde SI para confirmar o NO para cancelar.',
    },
  ])('$title', ({ patientName, clinicName, startsAt, timezone, expected }) => {
    expect(reminderText({ patientName, clinicName, startsAt, timezone })).toBe(expected);
  });
});
