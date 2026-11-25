import { describe, expect, test } from 'vitest';
import type { Phone } from '@/domain/patient';
import type { ReminderId } from '@/domain/reminder';
import { provider } from '@/infra/provider/client';
import { PROVIDER_URL } from 'tests/helpers/api';

// The provider stack is shared with other API test files: every test uses its own phone
// and its own Idempotency-Key, and reads back only what the provider recorded for that phone.

type DeliveredMessage = { id: string; to: string; text: string; idempotencyKey: string; deliveredAt: string };
type ReceivedRequest = { idempotencyKey: string | null; to: string | null; text: string | null; receivedAt: string; status: number };

async function deliveredMessagesTo(phone: string): Promise<DeliveredMessage[]> {
  const response = await fetch(`${PROVIDER_URL}/admin/messages?to=${encodeURIComponent(phone)}`);
  return (await response.json()) as DeliveredMessage[];
}

async function requestsReceivedFor(phone: string): Promise<ReceivedRequest[]> {
  const response = await fetch(`${PROVIDER_URL}/admin/requests?to=${encodeURIComponent(phone)}`);
  return (await response.json()) as ReceivedRequest[];
}

async function makeNextRequestsBehaveAs(input: { to: string; mode: 'unavailable' | 'lost-response' | 'reject'; count: number }): Promise<void> {
  const response = await fetch(`${PROVIDER_URL}/admin/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.status !== 204) throw new Error(`POST /admin/rules answered ${response.status}`);
}

describe('the request sent to the provider', () => {
  test('posts the phone and the text as a message, with the reminder id as Idempotency-Key', async () => {
    await provider.sendMessage({
      to: '+34600130001' as Phone,
      text: 'Recordatorio: tienes cita mañana a las 10:00.',
      idempotencyKey: 'provider-client-request-shape' as ReminderId,
    });

    expect(await requestsReceivedFor('+34600130001')).toEqual([
      {
        idempotencyKey: 'provider-client-request-shape',
        to: '+34600130001',
        text: 'Recordatorio: tienes cita mañana a las 10:00.',
        receivedAt: expect.any(String),
        status: 202,
      },
    ]);
    expect(await deliveredMessagesTo('+34600130001')).toEqual([
      {
        id: expect.any(String),
        to: '+34600130001',
        text: 'Recordatorio: tienes cita mañana a las 10:00.',
        idempotencyKey: 'provider-client-request-shape',
        deliveredAt: expect.any(String),
      },
    ]);
  });
});

describe('the outcome of each provider answer', () => {
  test('a message accepted with 202 is delivered', async () => {
    const outcome = await provider.sendMessage({
      to: '+34600130002' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-accepted' as ReminderId,
    });

    expect(outcome).toBe('delivered');
  });

  test('a message the carrier rejects with 422 is rejected and nothing reaches the patient', async () => {
    await makeNextRequestsBehaveAs({ to: '+34600130003', mode: 'reject', count: 1 });

    const outcome = await provider.sendMessage({
      to: '+34600130003' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-carrier-rejects' as ReminderId,
    });

    expect(outcome).toBe('rejected');
    expect(await deliveredMessagesTo('+34600130003')).toEqual([]);
  });

  test('a request the provider finds invalid with 400 is rejected', async () => {
    const outcome = await provider.sendMessage({
      to: '600130004' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-invalid-phone' as ReminderId,
    });

    expect(outcome).toBe('rejected');
    expect(await requestsReceivedFor('600130004')).toEqual([expect.objectContaining({ status: 400 })]);
  });

  test('a provider temporarily unavailable with 503 has not delivered and nothing reaches the patient', async () => {
    await makeNextRequestsBehaveAs({ to: '+34600130005', mode: 'unavailable', count: 1 });

    const outcome = await provider.sendMessage({
      to: '+34600130005' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-unavailable' as ReminderId,
    });

    expect(outcome).toBe('not_delivered');
    expect(await deliveredMessagesTo('+34600130005')).toEqual([]);
  });

  test('a gateway timeout with 504 is unknown, because the message may have been delivered', async () => {
    await makeNextRequestsBehaveAs({ to: '+34600130006', mode: 'lost-response', count: 1 });

    const outcome = await provider.sendMessage({
      to: '+34600130006' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-lost-response' as ReminderId,
    });

    expect(outcome).toBe('unknown');
    expect(await requestsReceivedFor('+34600130006')).toEqual([expect.objectContaining({ status: 504 })]);
  });
});

describe('sending twice with the same Idempotency-Key', () => {
  test('the second send is answered 200 as a duplicate, counts as delivered and the patient gets one message', async () => {
    const firstOutcome = await provider.sendMessage({
      to: '+34600130007' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-sent-twice' as ReminderId,
    });
    const secondOutcome = await provider.sendMessage({
      to: '+34600130007' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-sent-twice' as ReminderId,
    });

    expect(firstOutcome).toBe('delivered');
    expect(secondOutcome).toBe('delivered');
    expect(await requestsReceivedFor('+34600130007')).toEqual([
      expect.objectContaining({ status: 202 }),
      expect.objectContaining({ status: 200 }),
    ]);
    expect(await deliveredMessagesTo('+34600130007')).toHaveLength(1);
  });

  test('a retry after a lost response is delivered and the patient still gets one message', async () => {
    await makeNextRequestsBehaveAs({ to: '+34600130008', mode: 'lost-response', count: 1 });

    const firstOutcome = await provider.sendMessage({
      to: '+34600130008' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-retry-after-lost-response' as ReminderId,
    });
    const retryOutcome = await provider.sendMessage({
      to: '+34600130008' as Phone,
      text: 'Recordatorio de cita',
      idempotencyKey: 'provider-client-retry-after-lost-response' as ReminderId,
    });

    expect(firstOutcome).toBe('unknown');
    expect(retryOutcome).toBe('delivered');
    expect(await deliveredMessagesTo('+34600130008')).toHaveLength(1);
  });
});
