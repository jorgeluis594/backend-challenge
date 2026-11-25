import { describe, expect, test } from 'vitest';
import { planReminder } from '@/app/plan-reminder';
import type { Timezone } from '@/domain/clinic';
import type { QuietHours } from '@/domain/reminder';

const MADRID = 'Europe/Madrid' as Timezone;
const CANARY = 'Atlantic/Canary' as Timezone;
const NO_SENDING_FROM_21_UNTIL_9: QuietHours = { from: 21, until: 9 };
const LONG_BEFORE_EVERY_CASE = new Date('2027-01-01T00:00:00Z');

// Madrid is UTC+1 in winter and UTC+2 in summer; the Canaries are UTC+0 and UTC+1.
// In 2027 the clocks go forward on Sunday 28 March and back on Sunday 31 October.

describe('the reminder goes out at the same local time on the previous day, in the clinic timezone', () => {
  test.each([
    {
      title: 'an ordinary winter day in Madrid: 10:00 on Wednesday 17/02 goes out at 10:00 on Tuesday 16/02',
      startsAt: new Date('2027-02-17T09:00:00Z'),
      timezone: MADRID,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T09:00:00Z') },
    },
    {
      title: 'the March clock change: 10:00 on Sunday 28/03/2027 goes out at 10:00 on Saturday 27/03 (09:00 UTC), 23 hours before',
      startsAt: new Date('2027-03-28T08:00:00Z'),
      timezone: MADRID,
      expected: { status: 'pending', scheduledFor: new Date('2027-03-27T09:00:00Z') },
    },
    {
      title: 'the October clock change: 10:00 on Sunday 31/10/2027 goes out at 10:00 on Saturday 30/10 (08:00 UTC), 25 hours before',
      startsAt: new Date('2027-10-31T09:00:00Z'),
      timezone: MADRID,
      expected: { status: 'pending', scheduledFor: new Date('2027-10-30T08:00:00Z') },
    },
    {
      title: 'the Canary Islands: 10:00 on Wednesday 17/02 in Las Palmas goes out at 10:00 Canary time on Tuesday 16/02 (10:00 UTC)',
      startsAt: new Date('2027-02-17T10:00:00Z'),
      timezone: CANARY,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T10:00:00Z') },
    },
  ])('$title', ({ startsAt, timezone, expected }) => {
    expect(
      planReminder({ startsAt, timezone, notBefore: LONG_BEFORE_EVERY_CASE, quietHours: NO_SENDING_FROM_21_UNTIL_9 }),
    ).toEqual(expected);
  });
});

describe('nothing goes out during quiet hours; a time inside them moves to the next end of quiet hours', () => {
  test.each([
    {
      title: 'an appointment at 20:59 keeps its reminder at 20:59 the day before, one minute before quiet hours',
      startsAt: new Date('2027-02-17T19:59:00Z'),
      timezone: MADRID,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T19:59:00Z') },
    },
    {
      title: 'an appointment at 21:00 moves its reminder from 21:00 the day before to 09:00 on the day of the appointment',
      startsAt: new Date('2027-02-17T20:00:00Z'),
      timezone: MADRID,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-17T08:00:00Z') },
    },
    {
      title: 'an appointment at 08:59 moves its reminder from 08:59 the day before to 09:00 that same day',
      startsAt: new Date('2027-02-17T07:59:00Z'),
      timezone: MADRID,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T08:00:00Z') },
    },
    {
      title: 'an appointment at 09:00 keeps its reminder at 09:00 the day before, the moment quiet hours end',
      startsAt: new Date('2027-02-17T08:00:00Z'),
      timezone: MADRID,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T08:00:00Z') },
    },
    {
      title: 'quiet hours are counted in Canary time: 08:30 in Las Palmas (09:30 in Madrid) moves to 09:00 Canary time',
      startsAt: new Date('2027-02-17T08:30:00Z'),
      timezone: CANARY,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T09:00:00Z') },
    },
    {
      title: 'a reminder at 22:00 on Saturday 27/03 moves to 09:00 on Sunday 28/03 in summer time (07:00 UTC)',
      startsAt: new Date('2027-03-28T20:00:00Z'),
      timezone: MADRID,
      quietHours: NO_SENDING_FROM_21_UNTIL_9,
      expected: { status: 'pending', scheduledFor: new Date('2027-03-28T07:00:00Z') },
    },
    {
      title: 'with quiet hours from 22 until 8, an appointment at 21:30 keeps its reminder at 21:30 the day before',
      startsAt: new Date('2027-02-17T20:30:00Z'),
      timezone: MADRID,
      quietHours: { from: 22, until: 8 },
      expected: { status: 'pending', scheduledFor: new Date('2027-02-16T20:30:00Z') },
    },
  ])('$title', ({ startsAt, timezone, quietHours, expected }) => {
    expect(planReminder({ startsAt, timezone, notBefore: LONG_BEFORE_EVERY_CASE, quietHours })).toEqual(expected);
  });
});

describe('when the computed time has already passed, the reminder goes out now, still outside quiet hours', () => {
  test.each([
    {
      title: 'an appointment at 18:00 on 17/02 booked at 11:00 that morning goes out at 11:00',
      startsAt: new Date('2027-02-17T17:00:00Z'),
      notBefore: new Date('2027-02-17T10:00:00Z'),
      expected: { status: 'pending', scheduledFor: new Date('2027-02-17T10:00:00Z') },
    },
    {
      title: 'an appointment at 12:00 on 17/02 booked at 23:00 the night before goes out at 09:00 on 17/02',
      startsAt: new Date('2027-02-17T11:00:00Z'),
      notBefore: new Date('2027-02-16T22:00:00Z'),
      expected: { status: 'pending', scheduledFor: new Date('2027-02-17T08:00:00Z') },
    },
  ])('$title', ({ startsAt, notBefore, expected }) => {
    expect(planReminder({ startsAt, timezone: MADRID, notBefore, quietHours: NO_SENDING_FROM_21_UNTIL_9 })).toEqual(
      expected,
    );
  });
});

describe('a reminder that would not go out strictly before the appointment is skipped as too_late', () => {
  test.each([
    {
      title: 'an appointment at 12:00 booked at 11:59 goes out at 11:59, one minute before it starts',
      startsAt: new Date('2027-02-17T11:00:00Z'),
      notBefore: new Date('2027-02-17T10:59:00Z'),
      expected: { status: 'pending', scheduledFor: new Date('2027-02-17T10:59:00Z') },
    },
    {
      title: 'an appointment at 12:00 booked at 12:00 is skipped as too_late',
      startsAt: new Date('2027-02-17T11:00:00Z'),
      notBefore: new Date('2027-02-17T11:00:00Z'),
      expected: { status: 'skipped', scheduledFor: new Date('2027-02-17T11:00:00Z'), skipReason: 'too_late' },
    },
    {
      title: 'an appointment at 09:00 booked at 22:00 the night before is skipped: quiet hours push it to 09:00, when it starts',
      startsAt: new Date('2027-02-17T08:00:00Z'),
      notBefore: new Date('2027-02-16T21:00:00Z'),
      expected: { status: 'skipped', scheduledFor: new Date('2027-02-17T08:00:00Z'), skipReason: 'too_late' },
    },
    {
      title: 'an appointment at 08:30 booked at 23:00 the night before is skipped: quiet hours push it past the start',
      startsAt: new Date('2027-02-17T07:30:00Z'),
      notBefore: new Date('2027-02-16T22:00:00Z'),
      expected: { status: 'skipped', scheduledFor: new Date('2027-02-17T08:00:00Z'), skipReason: 'too_late' },
    },
  ])('$title', ({ startsAt, notBefore, expected }) => {
    expect(planReminder({ startsAt, timezone: MADRID, notBefore, quietHours: NO_SENDING_FROM_21_UNTIL_9 })).toEqual(
      expected,
    );
  });
});
