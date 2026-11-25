import { describe, expect, test } from 'vitest';
import { PROVIDER_URL, request, setClock } from 'tests/helpers/api';
import { type AppointmentBody, createAppointment, createClinic, createPatient } from 'tests/helpers/fixtures';

// Rule 3: between 21:00 and 09:00 clinic time nothing is sent, and that holds when the pass
// runs, not only when the reminder is scheduled. Retries do not wait for the quiet hours.
// The stack is shared: every test uses its own clinic, patient and phone, and asserts only on
// its own appointment and on what the provider recorded for its own phone.
// Dates are in March 2027, before the clock change: Madrid is UTC+1 and Canarias is UTC+0.

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

async function makeNextRequestsBehaveAs(input: { to: string; mode: 'unavailable'; count: number }): Promise<void> {
  const response = await fetch(`${PROVIDER_URL}/admin/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.status !== 204) throw new Error(`POST /admin/rules answered ${response.status}`);
}

function runReminderPass() {
  return request('POST', '/jobs/reminders/run');
}

async function getAppointment(id: string): Promise<AppointmentBody> {
  const response = await request('GET', `/appointments/${id}`);
  if (response.status !== 200) throw new Error(`GET /appointments/${id} answered ${response.status}`);
  return response.body as AppointmentBody;
}

describe('a first attempt whose pass runs inside quiet hours', () => {
  test('a reminder due at 20:30 whose pass runs at 22:00 is not sent and stays pending with the same time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Pasada Tardía', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Alba', phone: '+34600180101', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:30:00Z', // Thursday 11/03/2027 20:30 in Madrid: the reminder goes out Wednesday at 20:30
    });
    await setClock('2027-03-10T21:00:00Z'); // Wednesday 22:00 in Madrid: no pass ran at 20:30

    const response = await runReminderPass();

    expect(response.status).toBe(200);
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-10T19:30:00.000Z',
        status: 'pending',
        attempts: 0,
        sentAt: null,
        skipReason: null,
      },
    ]);
    expect(await requestsReceivedFor('+34600180101')).toEqual([]);
  });

  test('that deferred reminder is sent by the pass at 09:00 the next morning, with its text', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Madrugadora', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Bruno', phone: '+34600180102', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:30:00Z', // Thursday 11/03/2027 20:30 in Madrid
    });
    await setClock('2027-03-10T21:00:00Z'); // Wednesday 22:00 in Madrid
    await runReminderPass();
    await setClock('2027-03-11T08:00:00Z'); // Thursday 09:00 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-10T19:30:00.000Z',
        status: 'sent',
        attempts: 1,
        sentAt: '2027-03-11T08:00:00.000Z',
        skipReason: null,
      },
    ]);
    expect(await deliveredMessagesTo('+34600180102')).toEqual([
      expect.objectContaining({
        text: 'Hola Bruno, te recordamos tu cita en Clínica Madrugadora el 11/03/2027 a las 20:30. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
  });

  test('a pass at 08:59 the next morning still does not send it', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Puntual', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Celia', phone: '+34600180103', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:30:00Z', // Thursday 20:30 in Madrid
    });
    await setClock('2027-03-11T07:59:00Z'); // Thursday 08:59 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ scheduledFor: '2027-03-10T19:30:00.000Z', status: 'pending', attempts: 0, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600180103')).toEqual([]);
  });

  test('a pass at exactly 21:00 does not send a reminder due at 20:30', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Del Cierre', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Darío', phone: '+34600180104', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:30:00Z', // Thursday 20:30 in Madrid
    });
    await setClock('2027-03-10T20:00:00Z'); // Wednesday 21:00 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ scheduledFor: '2027-03-10T19:30:00.000Z', status: 'pending', attempts: 0, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600180104')).toEqual([]);
  });

  test('a pass at 20:59 sends a reminder due at 20:30', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Del Último Minuto', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Eva', phone: '+34600180105', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:30:00Z', // Thursday 20:30 in Madrid
    });
    await setClock('2027-03-10T19:59:00Z'); // Wednesday 20:59 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 1, sentAt: '2027-03-10T19:59:00.000Z' }),
    ]);
    expect(await deliveredMessagesTo('+34600180105')).toHaveLength(1);
  });

  test('quiet hours are the clinic ones: a Canarias clinic sends at 20:45 Canarias time, when it is 21:45 in Madrid', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Isleña', timezone: 'Atlantic/Canary' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Fayna', phone: '+34600180106', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T20:30:00Z', // Thursday 20:30 in Canarias: the reminder goes out Wednesday at 20:30
    });
    await setClock('2027-03-10T20:45:00Z'); // Wednesday 20:45 in Canarias, 21:45 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 1, sentAt: '2027-03-10T20:45:00.000Z' }),
    ]);
    expect(await deliveredMessagesTo('+34600180106')).toHaveLength(1);
  });

  test('a Canarias clinic does not send at 21:15 Canarias time, though it is already 22:15 in Madrid', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Del Atlántico', timezone: 'Atlantic/Canary' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Guacimara', phone: '+34600180107', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T20:30:00Z', // Thursday 20:30 in Canarias
    });
    await setClock('2027-03-10T21:15:00Z'); // Wednesday 21:15 in Canarias

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ scheduledFor: '2027-03-10T20:30:00.000Z', status: 'pending', attempts: 0, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600180107')).toEqual([]);
  });
});

describe('a first attempt that cannot wait until 09:00', () => {
  test('an appointment at 08:30 the next morning leaves the reminder skipped as too_late after a night pass, and the provider is not called', async () => {
    await setClock('2027-03-10T19:30:00Z'); // Wednesday 20:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica Temprana', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Héctor', phone: '+34600180108', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T07:30:00Z', // Thursday 08:30 in Madrid: the day-before time passed, the reminder goes out now
    });
    expect(appointment.reminders).toEqual([
      expect.objectContaining({ scheduledFor: '2027-03-10T19:30:00.000Z', status: 'pending', attempts: 0 }),
    ]);
    await setClock('2027-03-10T21:00:00Z'); // Wednesday 22:00 in Madrid: the next 09:00 is after the appointment

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'skipped', attempts: 0, sentAt: null, skipReason: 'too_late' }),
    ]);
    expect(await requestsReceivedFor('+34600180108')).toEqual([]);
  });

  test('an appointment at exactly 09:00 the next morning is also skipped as too_late, because 09:00 is not before it', async () => {
    await setClock('2027-03-10T19:30:00Z'); // Wednesday 20:30 in Madrid
    const clinic = await createClinic({ name: 'Clínica De Las Nueve', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Irene', phone: '+34600180109', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T08:00:00Z', // Thursday 09:00 in Madrid
    });
    expect(appointment.reminders).toEqual([
      expect.objectContaining({ scheduledFor: '2027-03-10T19:30:00.000Z', status: 'pending', attempts: 0 }),
    ]);
    await setClock('2027-03-10T21:00:00Z'); // Wednesday 22:00 in Madrid

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'skipped', attempts: 0, sentAt: null, skipReason: 'too_late' }),
    ]);
    expect(await requestsReceivedFor('+34600180109')).toEqual([]);
  });
});

describe('retries inside quiet hours', () => {
  test('a first attempt at 20:59 that fails with 503 is retried at 21:00 and delivered', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Perseverante', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Joaquín', phone: '+34600180110', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:59:00Z', // Thursday 20:59 in Madrid: the reminder goes out Wednesday at 20:59
    });
    await makeNextRequestsBehaveAs({ to: '+34600180110', mode: 'unavailable', count: 1 });
    await setClock('2027-03-10T19:59:00Z'); // Wednesday 20:59 in Madrid
    await runReminderPass();
    await setClock('2027-03-10T20:00:00Z'); // Wednesday 21:00 in Madrid, quiet hours: the retry is due

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 2, sentAt: '2027-03-10T20:00:00.000Z', skipReason: null }),
    ]);
    expect(await requestsReceivedFor('+34600180110')).toEqual([
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 202 }),
    ]);
    expect(await deliveredMessagesTo('+34600180110')).toHaveLength(1);
  });
});
