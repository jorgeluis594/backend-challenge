import { describe, expect, test } from 'vitest';
import { afterAttempt } from '@/app/after-attempt';
import type { ReminderSettlement, SendOutcome } from '@/domain/reminder';

const ATTEMPTED_AT_10_00_MADRID = new Date('2027-02-16T09:00:00Z');

describe('a 200 or 202 from the provider means delivered: the reminder is sent at the instant of the attempt', () => {
  test.each([
    {
      title: 'delivered on the first attempt is sent with one attempt',
      attempt: 1,
      expected: { status: 'sent', attempts: 1, sentAt: new Date('2027-02-16T09:00:00Z') },
    },
    {
      title: 'delivered on the third attempt is sent with three attempts',
      attempt: 3,
      expected: { status: 'sent', attempts: 3, sentAt: new Date('2027-02-16T09:00:00Z') },
    },
  ])('$title', ({ attempt, expected }) => {
    expect(afterAttempt({ outcome: 'delivered', attempt, attemptedAt: ATTEMPTED_AT_10_00_MADRID })).toEqual(expected);
  });
});

describe('a 422 from the provider means rejected: the reminder is failed with no retry', () => {
  test.each([
    {
      title: 'rejected on the first attempt is failed with one attempt',
      attempt: 1,
      expected: { status: 'failed', attempts: 1 },
    },
    {
      title: 'rejected on the second attempt is failed with two attempts',
      attempt: 2,
      expected: { status: 'failed', attempts: 2 },
    },
  ])('$title', ({ attempt, expected }) => {
    expect(afterAttempt({ outcome: 'rejected', attempt, attemptedAt: ATTEMPTED_AT_10_00_MADRID })).toEqual(expected);
  });
});

describe('after a 503, a 504, a network error or a timeout, the second attempt goes 1 minute later, the third 5 minutes later, and a third failure is final', () => {
  test.each<{ title: string; outcome: SendOutcome; attempt: number; expected: ReminderSettlement }>([
    {
      title: 'not delivered on the first attempt is retried 1 minute later',
      outcome: 'not_delivered',
      attempt: 1,
      expected: { status: 'pending', attempts: 1, nextAttemptAt: new Date('2027-02-16T09:01:00Z') },
    },
    {
      title: 'not delivered on the second attempt is retried 5 minutes later',
      outcome: 'not_delivered',
      attempt: 2,
      expected: { status: 'pending', attempts: 2, nextAttemptAt: new Date('2027-02-16T09:05:00Z') },
    },
    {
      title: 'not delivered on the third attempt is failed',
      outcome: 'not_delivered',
      attempt: 3,
      expected: { status: 'failed', attempts: 3 },
    },
    {
      title: 'an unknown result on the first attempt is retried 1 minute later',
      outcome: 'unknown',
      attempt: 1,
      expected: { status: 'pending', attempts: 1, nextAttemptAt: new Date('2027-02-16T09:01:00Z') },
    },
    {
      title: 'an unknown result on the second attempt is retried 5 minutes later',
      outcome: 'unknown',
      attempt: 2,
      expected: { status: 'pending', attempts: 2, nextAttemptAt: new Date('2027-02-16T09:05:00Z') },
    },
    {
      title: 'an unknown result on the third attempt is failed',
      outcome: 'unknown',
      attempt: 3,
      expected: { status: 'failed', attempts: 3 },
    },
  ])('$title', ({ outcome, attempt, expected }) => {
    expect(afterAttempt({ outcome, attempt, attemptedAt: ATTEMPTED_AT_10_00_MADRID })).toEqual(expected);
  });
});

describe('retries do not wait for the 21:00 to 09:00 quiet hours to end', () => {
  test.each([
    {
      title: 'a failure on the first attempt at 23:30 Madrid is retried at 23:31',
      attempt: 1,
      attemptedAt: new Date('2027-02-16T22:30:00Z'),
      expected: { status: 'pending', attempts: 1, nextAttemptAt: new Date('2027-02-16T22:31:00Z') },
    },
    {
      title: 'a failure on the second attempt at 20:58 Madrid is retried at 21:03, inside the quiet hours',
      attempt: 2,
      attemptedAt: new Date('2027-02-16T19:58:00Z'),
      expected: { status: 'pending', attempts: 2, nextAttemptAt: new Date('2027-02-16T20:03:00Z') },
    },
  ])('$title', ({ attempt, attemptedAt, expected }) => {
    expect(afterAttempt({ outcome: 'not_delivered', attempt, attemptedAt })).toEqual(expected);
  });
});
