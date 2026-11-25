import { describe, expect, test } from 'vitest';
import { API_URL, request } from 'tests/helpers/api';

describe('POST /clinics', () => {
  test.each([
    ['Clínica Dental Sonrisa', 'Europe/Madrid'],
    ['Clínica Las Palmas', 'Atlantic/Canary'],
  ])('creates the clinic %s in %s and answers 201 with its id, name and timezone', async (name, timezone) => {
    const response = await request('POST', '/clinics', { name, timezone });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(String), name, timezone });
    expect(response.body).not.toMatchObject({ id: '' });
  });

  test('accepts a name of a single character', async () => {
    const response = await request('POST', '/clinics', { name: 'A', timezone: 'Europe/Madrid' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(String), name: 'A', timezone: 'Europe/Madrid' });
  });

  test('gives two clinics created with the same data different ids', async () => {
    const first = await request('POST', '/clinics', { name: 'Clínica Duplicada', timezone: 'Europe/Madrid' });
    const second = await request('POST', '/clinics', { name: 'Clínica Duplicada', timezone: 'Europe/Madrid' });

    expect(first.body).not.toEqual(second.body);
  });

  test('rejects a timezone that does not exist with 400 and an error message', async () => {
    const response = await request('POST', '/clinics', { name: 'Clínica Perdida', timezone: 'Europe/Atlantis' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test.each([
    ['without name', { timezone: 'Europe/Madrid' }],
    ['with an empty name', { name: '', timezone: 'Europe/Madrid' }],
    ['with a name that is not a string', { name: 42, timezone: 'Europe/Madrid' }],
    ['without timezone', { name: 'Clínica Sin Zona' }],
    ['with a timezone that is not a string', { name: 'Clínica Numérica', timezone: 1 }],
  ])('rejects a body %s with 400 and an error message', async (_, body) => {
    const response = await request('POST', '/clinics', body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('rejects malformed JSON with 400 and an error message', async () => {
    const response = await fetch(`${API_URL}/clinics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name": "Clínica Rota", ',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
