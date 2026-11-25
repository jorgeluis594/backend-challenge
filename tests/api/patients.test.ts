import { describe, expect, test } from 'vitest';
import { API_URL, request } from 'tests/helpers/api';
import { createClinic } from 'tests/helpers/fixtures';

describe('POST /patients', () => {
  test('creates a patient in an existing clinic and answers 201 with the data as sent', async () => {
    const clinic = await createClinic({ name: 'Clínica Dental Sonrisa', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Ana',
      phone: '+34600111201',
      acceptsReminders: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      name: 'Ana',
      phone: '+34600111201',
      acceptsReminders: true,
    });
    expect(response.body).not.toMatchObject({ id: '' });
  });

  test('stores a patient who does not accept reminders with acceptsReminders false', async () => {
    const clinic = await createClinic({ name: 'Clínica Sin Avisos', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Bruno',
      phone: '+34600111202',
      acceptsReminders: false,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      name: 'Bruno',
      phone: '+34600111202',
      acceptsReminders: false,
    });
  });

  test('accepts a patient with phone null and answers with phone null', async () => {
    const clinic = await createClinic({ name: 'Clínica Sin Teléfono', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Carla',
      phone: null,
      acceptsReminders: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      name: 'Carla',
      phone: null,
      acceptsReminders: true,
    });
  });

  test('accepts a patient without phone and stores it as phone null', async () => {
    const clinic = await createClinic({ name: 'Clínica Sin Campo', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Diego',
      acceptsReminders: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      name: 'Diego',
      phone: null,
      acceptsReminders: true,
    });
  });

  test('answers 404 with an error message when the clinic is a UUID of no clinic', async () => {
    const response = await request('POST', '/patients', {
      clinicId: '00000000-0000-4000-8000-000000000000',
      name: 'Elena',
      phone: '+34600111203',
      acceptsReminders: true,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers a clinicId that is not a UUID with the same 404 as a clinic that does not exist', async () => {
    const missingClinic = await request('POST', '/patients', {
      clinicId: '00000000-0000-4000-8000-000000000000',
      name: 'Fernando',
      phone: '+34600111204',
      acceptsReminders: true,
    });

    const notAUuid = await request('POST', '/patients', {
      clinicId: 'not-a-uuid',
      name: 'Fernando',
      phone: '+34600111204',
      acceptsReminders: true,
    });

    expect(notAUuid.status).toBe(404);
    expect(notAUuid.body).toEqual(missingClinic.body);
  });

  test.each([
    ['without the leading +', '600111222'],
    ['with spaces', '+34 600 111 222'],
    ['whose first digit is 0', '+0123456789'],
    ['with 7 digits, one fewer than the minimum', '+3460011'],
    ['with 16 digits, one more than the maximum', '+3460011122233344'],
  ])('rejects a phone %s (%s) with 400 and an error message', async (_, phone) => {
    const clinic = await createClinic({ name: 'Clínica Teléfonos', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Gema',
      phone,
      acceptsReminders: true,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test.each([
    ['with 8 digits, the minimum', '+34600111'],
    ['with 15 digits, the maximum', '+346001112050000'],
  ])('accepts a phone %s (%s)', async (_, phone) => {
    const clinic = await createClinic({ name: 'Clínica Límites', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', {
      clinicId: clinic.id,
      name: 'Hugo',
      phone,
      acceptsReminders: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ phone });
  });

  test('rejects a body without clinicId with 400 and an error message', async () => {
    const response = await request('POST', '/patients', { name: 'Inés', phone: '+34600111206', acceptsReminders: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test.each([
    ['without name', { phone: '+34600111207', acceptsReminders: true }],
    ['with an empty name', { name: '', phone: '+34600111207', acceptsReminders: true }],
    ['without acceptsReminders', { name: 'Inés', phone: '+34600111207' }],
    ['with acceptsReminders that is not a boolean', { name: 'Inés', phone: '+34600111207', acceptsReminders: 'yes' }],
    ['with a phone that is a number', { name: 'Inés', phone: 34600111207, acceptsReminders: true }],
  ])('rejects a body %s with 400 and an error message', async (_, fields) => {
    const clinic = await createClinic({ name: 'Clínica Formularios', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/patients', { clinicId: clinic.id, ...fields });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('rejects malformed JSON with 400 and an error message', async () => {
    const response = await fetch(`${API_URL}/patients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name": "Julia", ',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
