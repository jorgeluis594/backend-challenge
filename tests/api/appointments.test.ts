import { describe, expect, test } from 'vitest';
import { request, setClock } from 'tests/helpers/api';
import { createAppointment, createClinic, createPatient } from 'tests/helpers/fixtures';

// Quiet hours are the service defaults: from 21:00 to 09:00 local clinic time.
// Madrid is UTC+1 in winter (CET) and UTC+2 in summer (CEST); Canarias is one hour behind.

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

describe('POST /appointments: when the reminder goes out', () => {
  test('creates a scheduled appointment with one pending reminder at the same local time the previous day', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Dental Sonrisa', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Ana', phone: '+34600140401', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z', // Wednesday 10:00 in Madrid
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: expect.any(String),
          scheduledFor: '2027-03-09T09:00:00.000Z', // Tuesday 10:00 in Madrid
          status: 'pending',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  test('on the March clock change it goes out at the same Madrid time, 23 hours before the appointment', async () => {
    await setClock('2027-03-20T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cambio de Marzo', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Bruno', phone: '+34600140402', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-28T08:00:00Z', // Sunday 28/03/2027 10:00 in Madrid (CEST)
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-27T09:00:00.000Z' }), // Saturday 10:00 (CET)
    ]);
  });

  test('on the October clock change it goes out at the same Madrid time, 25 hours before the appointment', async () => {
    await setClock('2027-10-20T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cambio de Octubre', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Carla', phone: '+34600140403', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-10-31T09:00:00Z', // Sunday 31/10/2027 10:00 in Madrid (CET)
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-10-30T08:00:00.000Z' }), // Saturday 10:00 (CEST)
    ]);
  });

  test('in a Canarias clinic it goes out at the same Canarias time, one hour later in UTC than in Madrid', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Atlántica', timezone: 'Atlantic/Canary' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Diego', phone: '+34600140404', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T10:00:00Z', // Wednesday 10:00 in Canarias (WET)
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-09T10:00:00.000Z' }), // Tuesday 10:00 in Canarias
    ]);
  });

  test('a send time at 22:00 local moves to 09:00 the next morning', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Nocturna', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Elena', phone: '+34600140405', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T21:00:00Z', // Wednesday 22:00 in Madrid
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-10T08:00:00.000Z' }), // Wednesday 09:00 in Madrid
    ]);
  });

  test('a send time at exactly 21:00 local is already in quiet hours and moves to 09:00 the next morning', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica de las Nueve', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Fernando', phone: '+34600140406', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T20:00:00Z', // Wednesday 21:00 in Madrid
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-10T08:00:00.000Z' }), // Wednesday 09:00 in Madrid
    ]);
  });

  test('a send time at 08:30 local moves to 09:00 the same morning', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Madrugadora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Gloria', phone: '+34600140407', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:30:00Z', // Wednesday 08:30 in Madrid
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-09T08:00:00.000Z' }), // Tuesday 09:00 in Madrid
    ]);
  });

  test('a send time at exactly 09:00 local is allowed and stays as it is', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica de Apertura', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Hugo', phone: '+34600140408', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T08:00:00Z', // Wednesday 09:00 in Madrid
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-09T08:00:00.000Z' }), // Tuesday 09:00 in Madrid
    ]);
  });

  test('when the send time already passed, it goes out now', async () => {
    await setClock('2027-03-09T14:00:00Z'); // Tuesday 15:00 in Madrid
    const clinic = await createClinic({ name: 'Clínica de Última Hora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Inés', phone: '+34600140409', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z', // Wednesday 10:00 in Madrid; the day before at 10:00 already passed
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-09T14:00:00.000Z' }),
    ]);
  });

  test('when the send time already passed and now is in quiet hours, it goes out at 09:00 the next morning', async () => {
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica de Noche', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Jorge', phone: '+34600140410', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T11:00:00Z', // Wednesday 12:00 in Madrid
    });

    expect(appointment.reminders).toEqual([
      expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-10T08:00:00.000Z' }), // Wednesday 09:00 in Madrid
    ]);
  });
});

describe('POST /appointments: when the reminder does not fit before the appointment', () => {
  test('a reminder that would go out after the appointment starts is born skipped as too_late', async () => {
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica Temprana', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Lucía', phone: '+34600140411', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00Z', // Wednesday 08:00 in Madrid, before quiet hours end
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: expect.any(String),
          scheduledFor: expect.stringMatching(/Z$/),
          status: 'skipped',
          attempts: 0,
          sentAt: null,
          skipReason: 'too_late',
        },
      ],
    });
  });

  test('a reminder that would go out exactly when the appointment starts is born skipped as too_late', async () => {
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica Puntual', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Mario', phone: '+34600140412', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T08:00:00Z', // Wednesday 09:00 in Madrid, the first time sending is allowed
    });

    expect(appointment.reminders).toEqual([expect.objectContaining({ status: 'skipped', skipReason: 'too_late' })]);
  });
});

describe('POST /appointments: rejected requests', () => {
  test('answers 404 with an error message when the clinic is a UUID of no clinic', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Real', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Nuria', phone: '+34600140413', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: UNKNOWN_UUID,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the clinicId is not a UUID', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Real', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Óscar', phone: '+34600140414', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: 'not-a-uuid',
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the patient is a UUID of no patient', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Paciente', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: UNKNOWN_UUID,
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the patientId is not a UUID', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Paciente', timezone: 'Europe/Madrid' });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: 'not-a-uuid',
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when the patient belongs to another clinic', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const patientsClinic = await createClinic({ name: 'Clínica del Paciente', timezone: 'Europe/Madrid' });
    const otherClinic = await createClinic({ name: 'Clínica Ajena', timezone: 'Europe/Madrid' });
    const patient = await createPatient({
      clinicId: patientsClinic.id,
      name: 'Pablo',
      phone: '+34600140415',
      acceptsReminders: true,
    });

    const response = await request('POST', '/appointments', {
      clinicId: otherClinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is exactly the service time', async () => {
    await setClock('2027-03-10T09:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Ahora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Quique', phone: '+34600140416', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is before the service time', async () => {
    await setClock('2027-03-10T09:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Pasada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Rosa', phone: '+34600140417', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T08:59:00Z',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is missing', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Hora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Sergio', phone: '+34600140418', acceptsReminders: true });

    const response = await request('POST', '/appointments', { clinicId: clinic.id, patientId: patient.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is a date-time without zone', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Zona', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Teresa', phone: '+34600140419', acceptsReminders: true });

    const response = await request('POST', '/appointments', {
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T10:00:00',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});

describe('POST /appointments: dates in the response', () => {
  test('a startsAt sent with an offset comes back as the same instant in UTC ending in Z', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Con Desfase', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Úrsula', phone: '+34600140420', acceptsReminders: true });

    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T10:00:00+01:00',
    });

    expect(appointment.startsAt).toBe('2027-03-10T09:00:00.000Z');
    expect(appointment.reminders).toEqual([expect.objectContaining({ scheduledFor: '2027-03-09T09:00:00.000Z' })]);
  });
});

describe('GET /appointments/:id', () => {
  test('answers 200 with the appointment and its reminder as they were created', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Consulta', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Valeria', phone: '+34600140421', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('GET', `/appointments/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: '2027-03-09T09:00:00.000Z',
          status: 'pending',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  test('answers 404 with an error message when the id is a UUID of no appointment', async () => {
    const response = await request('GET', `/appointments/${UNKNOWN_UUID}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the id is not a UUID', async () => {
    const response = await request('GET', '/appointments/not-a-uuid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});

describe('POST /appointments/:id/cancel', () => {
  test('answers 200 with the appointment cancelled and its pending reminder cancelled, dates in UTC ending in Z', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cancelación', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Alba', phone: '+34600140501', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('POST', `/appointments/${created.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00.000Z',
      status: 'cancelled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: '2027-03-09T09:00:00.000Z',
          status: 'cancelled',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  test('a later GET shows the appointment and its reminder cancelled', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cancelación Consultada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Blas', phone: '+34600140502', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('POST', `/appointments/${created.id}/cancel`);

    const response = await request('GET', `/appointments/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00.000Z',
      status: 'cancelled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: '2027-03-09T09:00:00.000Z',
          status: 'cancelled',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  test('a reminder born skipped as too_late stays skipped as too_late', async () => {
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica Cancelación Tardía', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Celia', phone: '+34600140503', acceptsReminders: true });
    const created = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00Z', // Wednesday 08:00 in Madrid, before quiet hours end
    });

    const response = await request('POST', `/appointments/${created.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00.000Z',
      status: 'cancelled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: created.reminders[0]?.scheduledFor,
          status: 'skipped',
          attempts: 0,
          sentAt: null,
          skipReason: 'too_late',
        },
      ],
    });
  });

  test('cancelling an appointment that is already cancelled answers 200 with the same body as the first time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Doble Cancelación', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Darío', phone: '+34600140504', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    const first = await request('POST', `/appointments/${created.id}/cancel`);

    const second = await request('POST', `/appointments/${created.id}/cancel`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  test('answers 404 with an error message when the id is a UUID of no appointment', async () => {
    const response = await request('POST', `/appointments/${UNKNOWN_UUID}/cancel`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the id is not a UUID', async () => {
    const response = await request('POST', '/appointments/not-a-uuid/cancel');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});

describe('PATCH /appointments/:id: the reminder for the new time', () => {
  test('answers 200 with the new time, the previous reminder cancelled first and a new pending one last at the same local time the previous day', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramación', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Adela', phone: '+34600140601', acceptsReminders: true });
    const created = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z', // Wednesday 10:00 in Madrid
    });

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-12T10:00:00Z', // Friday 11:00 in Madrid
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-12T10:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: '2027-03-09T09:00:00.000Z',
          status: 'cancelled',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
        {
          id: expect.any(String),
          scheduledFor: '2027-03-11T10:00:00.000Z', // Thursday 11:00 in Madrid
          status: 'pending',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  test('a later GET shows the new time with the cancelled reminder first and the new pending one last', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramación Consultada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Benito', phone: '+34600140602', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    const rescheduled = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T10:00:00Z' });

    const response = await request('GET', `/appointments/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(rescheduled.body);
    expect(response.body).toEqual(
      expect.objectContaining({
        startsAt: '2027-03-12T10:00:00.000Z',
        status: 'scheduled',
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'cancelled' }),
          expect.objectContaining({ scheduledFor: '2027-03-11T10:00:00.000Z', status: 'pending' }),
        ],
      }),
    );
  });

  test('moved onto the March clock change, the new reminder goes out at the same Madrid time the previous day', async () => {
    await setClock('2027-03-20T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada en Marzo', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Camila', phone: '+34600140603', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-25T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-28T08:00:00Z', // Sunday 28/03/2027 10:00 in Madrid (CEST)
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'cancelled' }),
          expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-27T09:00:00.000Z' }), // Saturday 10:00 (CET)
        ],
      }),
    );
  });

  test('when the new send time falls at 22:00 local, the new reminder moves to 09:00 the next morning', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada de Noche', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Damián', phone: '+34600140604', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-12T21:00:00Z', // Friday 22:00 in Madrid
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'cancelled' }),
          expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-12T08:00:00.000Z' }), // Friday 09:00 in Madrid
        ],
      }),
    );
  });

  test('when the new send time already passed at the moment of rescheduling, the new reminder goes out now', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada Tarde', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Eva', phone: '+34600140605', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-11T09:00:00Z' });
    await setClock('2027-03-09T14:00:00Z'); // Tuesday 15:00 in Madrid

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-10T09:00:00Z', // Wednesday 10:00 in Madrid; the day before at 10:00 already passed
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'cancelled' }),
          expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-09T14:00:00.000Z' }),
        ],
      }),
    );
  });

  test('when the new send time already passed and now is in quiet hours, the new reminder goes out at 09:00 the next morning', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada de Madrugada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Fabio', phone: '+34600140606', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-12T09:00:00Z' });
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-10T11:00:00Z', // Wednesday 12:00 in Madrid
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'cancelled' }),
          expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-10T08:00:00.000Z' }), // Wednesday 09:00 in Madrid
        ],
      }),
    );
  });

  test('when the new reminder would go out after the new time, it is born skipped as too_late', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada Temprano', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Gema', phone: '+34600140607', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-12T09:00:00Z' });
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-10T07:00:00Z', // Wednesday 08:00 in Madrid, before quiet hours end
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: created.id,
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: created.reminders[0]?.id,
          scheduledFor: '2027-03-11T09:00:00.000Z',
          status: 'cancelled',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
        {
          id: expect.any(String),
          scheduledFor: expect.stringMatching(/Z$/),
          status: 'skipped',
          attempts: 0,
          sentAt: null,
          skipReason: 'too_late',
        },
      ],
    });
  });

  test('a previous reminder born skipped as too_late stays skipped and the new time gets a pending one', async () => {
    await setClock('2027-03-09T21:30:00Z'); // Tuesday 22:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica Segunda Oportunidad', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Héctor', phone: '+34600140608', acceptsReminders: true });
    const created = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T07:00:00Z', // Wednesday 08:00 in Madrid: born skipped as too_late
    });

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-12T09:00:00Z', // Friday 10:00 in Madrid
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, status: 'skipped', skipReason: 'too_late' }),
          expect.objectContaining({ status: 'pending', scheduledFor: '2027-03-11T09:00:00.000Z', skipReason: null }),
        ],
      }),
    );
  });

  test('rescheduling twice lists three reminders oldest to newest, only the last one pending', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Indecisa', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Irene', phone: '+34600140609', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T10:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-08T11:00:00Z' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        startsAt: '2027-03-08T11:00:00.000Z',
        reminders: [
          expect.objectContaining({ id: created.reminders[0]?.id, scheduledFor: '2027-03-09T09:00:00.000Z', status: 'cancelled' }),
          expect.objectContaining({ scheduledFor: '2027-03-11T10:00:00.000Z', status: 'cancelled' }),
          expect.objectContaining({ scheduledFor: '2027-03-07T11:00:00.000Z', status: 'pending' }),
        ],
      }),
    );
  });
});

describe('PATCH /appointments/:id: to the same instant', () => {
  test('the same instant written with another offset answers 200 and keeps the single pending reminder', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Misma Hora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Julián', phone: '+34600140610', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, {
      startsAt: '2027-03-10T10:00:00+01:00', // the same instant, written in Madrid time
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  test('a later GET still shows a single pending reminder', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Misma Hora Consultada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Karen', phone: '+34600140611', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('GET', `/appointments/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });
});

describe('PATCH /appointments/:id: rejected requests', () => {
  test('answers 409 with an error message when the appointment is cancelled', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cita Cancelada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Leo', phone: '+34600140612', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('POST', `/appointments/${created.id}/cancel`);

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T10:00:00Z' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 409 with an error message when the appointment starts exactly at the service time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cita Empezada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Marta', phone: '+34600140613', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-10T09:00:00Z');

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T10:00:00Z' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when the new startsAt is exactly the service time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Nueva Hora Ahora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Nicolás', phone: '+34600140614', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-01T08:00:00Z' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when the new startsAt is before the service time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Nueva Hora Pasada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Olga', phone: '+34600140615', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-01T07:59:00Z' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is missing', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Nueva Hora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Pedro', phone: '+34600140616', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 400 with an error message when startsAt is a date-time without zone', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Nueva Hora Sin Zona', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Raquel', phone: '+34600140617', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T11:00:00' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the id is a UUID of no appointment', async () => {
    await setClock('2027-03-01T08:00:00Z');

    const response = await request('PATCH', `/appointments/${UNKNOWN_UUID}`, { startsAt: '2027-03-12T10:00:00Z' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('answers 404 with an error message when the id is not a UUID', async () => {
    await setClock('2027-03-01T08:00:00Z');

    const response = await request('PATCH', '/appointments/not-a-uuid', { startsAt: '2027-03-12T10:00:00Z' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});

describe('PATCH /appointments/:id: dates in the response', () => {
  test('a new startsAt sent with an offset comes back as the same instant in UTC ending in Z', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramada Con Desfase', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Samuel', phone: '+34600140618', acceptsReminders: true });
    const created = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });

    const response = await request('PATCH', `/appointments/${created.id}`, { startsAt: '2027-03-12T11:00:00+01:00' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        startsAt: '2027-03-12T10:00:00.000Z',
        reminders: [
          expect.objectContaining({ scheduledFor: '2027-03-09T09:00:00.000Z' }),
          expect.objectContaining({ scheduledFor: '2027-03-11T10:00:00.000Z' }),
        ],
      }),
    );
  });
});
