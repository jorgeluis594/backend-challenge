import { describe, expect, test } from 'vitest';
import { API_URL, request } from 'tests/helpers/api';

describe('health', () => {
  test('answers 200 when the service is ready', async () => {
    const response = await request('GET', '/health');

    expect(response.status).toBe(200);
  });
});

describe('test clock', () => {
  test.each([
    ['in UTC', '2027-03-28T08:00:00Z'],
    ['with an offset', '2027-03-28T10:00:00+02:00'],
  ])('accepts a date-time %s and answers 204', async (_, now) => {
    const response = await request('PUT', '/test/clock', { now });

    expect(response.status).toBe(204);
  });

  test('rejects a date-time without zone with 400 and an error message', async () => {
    const response = await request('PUT', '/test/clock', { now: '2027-03-28T08:00:00' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('rejects a body without now with 400 and an error message', async () => {
    const response = await request('PUT', '/test/clock', {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('rejects malformed JSON with 400 and an error message', async () => {
    const response = await fetch(`${API_URL}/test/clock`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"now": ',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});

describe('routes of the contract not built yet', () => {
  test.each([
    ['POST', '/webhooks/inbound-messages'],
  ] as const)('%s %s answers 501 with an error message', async (method, path) => {
    const response = await request(method, path);

    expect(response.status).toBe(501);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});

describe('unknown route', () => {
  test('answers 404 with an error message', async () => {
    const response = await request('GET', '/no-such-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});
