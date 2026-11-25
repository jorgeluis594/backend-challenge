import { describe, expect, test } from 'vitest';
import { decideSend } from '@/app/decide-send';
import type { Phone } from '@/domain/patient';

const PATIENT_PHONE = '+34600111222' as Phone;
const APPOINTMENT_AT_10_00 = new Date('2027-02-17T09:00:00Z');

describe('a reminder goes out to the patient phone when the appointment has not started and the patient accepts reminders', () => {
  test.each([
    {
      title: 'an attempt the day before the appointment is sent to the patient phone',
      at: new Date('2027-02-16T09:00:00Z'),
      expected: { action: 'send', to: '+34600111222' },
    },
    {
      title: 'a retry one minute before the appointment starts is still sent to the patient phone',
      at: new Date('2027-02-17T08:59:00Z'),
      expected: { action: 'send', to: '+34600111222' },
    },
  ])('$title', ({ at, expected }) => {
    expect(
      decideSend({ startsAt: APPOINTMENT_AT_10_00, phone: PATIENT_PHONE, acceptsReminders: true, at }),
    ).toEqual(expected);
  });
});

describe('if the appointment has already started when the reminder is about to go out, also on a retry, it is skipped as too_late', () => {
  test.each([
    {
      title: 'an attempt at the exact minute the appointment starts is skipped as too_late',
      at: new Date('2027-02-17T09:00:00Z'),
      expected: { action: 'skip', reason: 'too_late' },
    },
    {
      title: 'a retry five minutes after the appointment started is skipped as too_late',
      at: new Date('2027-02-17T09:05:00Z'),
      expected: { action: 'skip', reason: 'too_late' },
    },
  ])('$title', ({ at, expected }) => {
    expect(
      decideSend({ startsAt: APPOINTMENT_AT_10_00, phone: PATIENT_PHONE, acceptsReminders: true, at }),
    ).toEqual(expected);
  });
});

describe('if the patient has no phone or does not accept reminders when it is due, the reminder is skipped', () => {
  test.each([
    {
      title: 'a patient without a phone is skipped as no_phone',
      phone: null,
      acceptsReminders: true,
      expected: { action: 'skip', reason: 'no_phone' },
    },
    {
      title: 'a patient with a phone who does not accept reminders is skipped as opted_out',
      phone: PATIENT_PHONE,
      acceptsReminders: false,
      expected: { action: 'skip', reason: 'opted_out' },
    },
  ])('$title', ({ phone, acceptsReminders, expected }) => {
    expect(
      decideSend({ startsAt: APPOINTMENT_AT_10_00, phone, acceptsReminders, at: new Date('2027-02-16T09:00:00Z') }),
    ).toEqual(expected);
  });
});

describe('when several reasons to skip apply, too_late wins over no_phone, and no_phone wins over opted_out', () => {
  test.each([
    {
      title: 'an appointment already started, for a patient without a phone who does not accept reminders, is skipped as too_late',
      phone: null,
      acceptsReminders: false,
      at: new Date('2027-02-17T09:05:00Z'),
      expected: { action: 'skip', reason: 'too_late' },
    },
    {
      title: 'an appointment already started, for a patient with a phone who does not accept reminders, is skipped as too_late',
      phone: PATIENT_PHONE,
      acceptsReminders: false,
      at: new Date('2027-02-17T09:05:00Z'),
      expected: { action: 'skip', reason: 'too_late' },
    },
    {
      title: 'an appointment not yet started, for a patient without a phone who does not accept reminders, is skipped as no_phone',
      phone: null,
      acceptsReminders: false,
      at: new Date('2027-02-16T09:00:00Z'),
      expected: { action: 'skip', reason: 'no_phone' },
    },
  ])('$title', ({ phone, acceptsReminders, at, expected }) => {
    expect(decideSend({ startsAt: APPOINTMENT_AT_10_00, phone, acceptsReminders, at })).toEqual(expected);
  });
});
