import { describe, expect, test } from 'vitest';
import { PROVIDER_URL, request, setClock } from 'tests/helpers/api';
import { type AppointmentBody, createAppointment, createClinic, createPatient } from 'tests/helpers/fixtures';

// The stack is shared: a pass may also treat reminders left by other tests. Every test uses
// its own clinic, patient and phone, and asserts only on its own appointments and on what the
// provider recorded for its own phone. `processed` is therefore a lower bound.
// Quiet hours are the service defaults: from 21:00 to 09:00 local clinic time.
// Madrid is UTC+1 in winter (CET) and UTC+2 in summer (CEST); Canarias is one hour behind.

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

function runReminderPass() {
  return request('POST', '/jobs/reminders/run');
}

async function getAppointment(id: string): Promise<AppointmentBody> {
  const response = await request('GET', `/appointments/${id}`);
  if (response.status !== 200) throw new Error(`GET /appointments/${id} answered ${response.status}`);
  return response.body as AppointmentBody;
}

describe('a due reminder is sent', () => {
  test('at its time the patient gets the exact reminder text once and the reminder becomes sent with sentAt', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Dental Sonrisa', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Ana', phone: '+34600150101', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:00Z', // Wednesday 10/03/2027 10:00 in Madrid
    });
    await setClock('2027-03-09T09:00:00Z'); // Tuesday 10:00 in Madrid: the reminder's time

    const response = await runReminderPass();

    expect(response.status).toBe(200);
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-09T09:00:00.000Z',
        status: 'sent',
        attempts: 1,
        sentAt: '2027-03-09T09:00:00.000Z',
        skipReason: null,
      },
    ]);
    expect(await deliveredMessagesTo('+34600150101')).toEqual([
      expect.objectContaining({
        to: '+34600150101',
        text: 'Hola Ana, te recordamos tu cita en Clínica Dental Sonrisa el 10/03/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
  });

  test('a later pass does not send a reminder that was already sent', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Envío Único', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Bea', phone: '+34600150102', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-09T09:00:00Z');
    await runReminderPass();
    await setClock('2027-03-09T09:10:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 1, sentAt: '2027-03-09T09:00:00.000Z' }),
    ]);
    expect(await requestsReceivedFor('+34600150102')).toHaveLength(1);
    expect(await deliveredMessagesTo('+34600150102')).toHaveLength(1);
  });

  test('the text carries the clinic local date, even when it is another day in UTC', async () => {
    await setClock('2027-06-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Nocturna', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Carlos', phone: '+34600150103', acceptsReminders: true });
    await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-06-15T22:30:00Z', // Wednesday 16/06/2027 00:30 in Madrid (CEST)
    });
    await setClock('2027-06-15T07:00:00Z'); // Tuesday 09:00 in Madrid: 00:30 is in quiet hours

    await runReminderPass();

    expect(await deliveredMessagesTo('+34600150103')).toEqual([
      expect.objectContaining({
        text: 'Hola Carlos, te recordamos tu cita en Clínica Nocturna el 16/06/2027 a las 00:30. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
  });

  test('in a Canarias clinic the text carries the Canarias time', async () => {
    await setClock('2027-06-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Atlántica', timezone: 'Atlantic/Canary' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Dácil', phone: '+34600150104', acceptsReminders: true });
    await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-06-16T09:00:00Z', // Wednesday 16/06/2027 10:00 in Canarias (WEST)
    });
    await setClock('2027-06-15T09:00:00Z'); // Tuesday 10:00 in Canarias

    await runReminderPass();

    expect(await deliveredMessagesTo('+34600150104')).toEqual([
      expect.objectContaining({
        text: 'Hola Dácil, te recordamos tu cita en Clínica Atlántica el 16/06/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
  });
});

describe('a reminder not yet due', () => {
  test('one minute before its time a pass leaves it pending and the provider is not called', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Paciente', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Elena', phone: '+34600150105', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-09T08:59:00Z'); // the reminder goes out at 09:00Z

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-09T09:00:00.000Z',
        status: 'pending',
        attempts: 0,
        sentAt: null,
        skipReason: null,
      },
    ]);
    expect(await requestsReceivedFor('+34600150105')).toEqual([]);
  });
});

describe('the response of a pass', () => {
  test('answers 200 with processed counting at least the due reminders it sent and skipped', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Contadora', timezone: 'Europe/Madrid' });
    const first = await createPatient({ clinicId: clinic.id, name: 'Fermín', phone: '+34600150106', acceptsReminders: true });
    const second = await createPatient({ clinicId: clinic.id, name: 'Gloria', phone: '+34600150107', acceptsReminders: true });
    const withoutPhone = await createPatient({ clinicId: clinic.id, name: 'Hugo', phone: null, acceptsReminders: true });
    await createAppointment({ clinicId: clinic.id, patientId: first.id, startsAt: '2027-03-10T09:00:00Z' });
    await createAppointment({ clinicId: clinic.id, patientId: second.id, startsAt: '2027-03-10T09:00:00Z' });
    await createAppointment({ clinicId: clinic.id, patientId: withoutPhone.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-09T09:00:00Z');

    const response = await runReminderPass();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ processed: expect.any(Number) });
    expect((response.body as { processed: number }).processed).toBeGreaterThanOrEqual(3);
  });
});

describe('a patient who cannot receive the reminder', () => {
  test('a patient with no phone leaves the reminder skipped as no_phone, with no attempt', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Teléfono', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Inés', phone: null, acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-09T09:00:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-09T09:00:00.000Z',
        status: 'skipped',
        attempts: 0,
        sentAt: null,
        skipReason: 'no_phone',
      },
    ]);
  });

  test('a patient who does not accept reminders leaves it skipped as opted_out and the provider is not called', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Avisos', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Jaime', phone: '+34600150108', acceptsReminders: false });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-09T09:00:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-09T09:00:00.000Z',
        status: 'skipped',
        attempts: 0,
        sentAt: null,
        skipReason: 'opted_out',
      },
    ]);
    expect(await requestsReceivedFor('+34600150108')).toEqual([]);
  });
});

describe('an appointment that already started', () => {
  test('a reminder still pending when its appointment has started is skipped as too_late and the provider is not called', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Retrasada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Lucía', phone: '+34600150109', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await setClock('2027-03-10T10:00:00Z'); // one hour after the appointment started; no pass ran before

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      {
        id: appointment.reminders[0]?.id,
        scheduledFor: '2027-03-09T09:00:00.000Z',
        status: 'skipped',
        attempts: 0,
        sentAt: null,
        skipReason: 'too_late',
      },
    ]);
    expect(await requestsReceivedFor('+34600150109')).toEqual([]);
  });

  test('a retry that comes after the appointment started is skipped as too_late instead of calling the provider again', async () => {
    await setClock('2027-03-10T09:00:00Z'); // Wednesday 10:00 in Madrid
    const clinic = await createClinic({ name: 'Clínica Último Minuto', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Manuel', phone: '+34600150110', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-10T09:00:30Z', // the day-before time already passed: the reminder goes out now
    });
    await makeNextRequestsBehaveAs({ to: '+34600150110', mode: 'unavailable', count: 1 });
    await runReminderPass(); // first attempt at 09:00:00Z fails with 503
    await setClock('2027-03-10T09:01:00Z'); // the retry is due, but the appointment started at 09:00:30Z

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'skipped', attempts: 1, sentAt: null, skipReason: 'too_late' }),
    ]);
    expect(await requestsReceivedFor('+34600150110')).toEqual([expect.objectContaining({ status: 503 })]);
    expect(await deliveredMessagesTo('+34600150110')).toEqual([]);
  });
});

describe('provider unavailable (503)', () => {
  test('the reminder stays pending, is retried 1 minute after the first failure and 5 minutes after the second, and is sent when the provider recovers', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Insistente', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Nuria', phone: '+34600150111', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await makeNextRequestsBehaveAs({ to: '+34600150111', mode: 'unavailable', count: 2 });

    await setClock('2027-03-09T09:00:00Z');
    await runReminderPass();
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'pending', attempts: 1, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600150111')).toHaveLength(1);

    await setClock('2027-03-09T09:00:59Z'); // not yet 1 minute after the first failure
    await runReminderPass();
    expect(await requestsReceivedFor('+34600150111')).toHaveLength(1);

    await setClock('2027-03-09T09:01:00Z');
    await runReminderPass();
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'pending', attempts: 2, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600150111')).toHaveLength(2);

    await setClock('2027-03-09T09:05:59Z'); // not yet 5 minutes after the second failure
    await runReminderPass();
    expect(await requestsReceivedFor('+34600150111')).toHaveLength(2);

    await setClock('2027-03-09T09:06:00Z');
    await runReminderPass();
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 3, sentAt: '2027-03-09T09:06:00.000Z', skipReason: null }),
    ]);
    expect(await requestsReceivedFor('+34600150111')).toEqual([
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 202 }),
    ]);
    expect(await deliveredMessagesTo('+34600150111')).toHaveLength(1);
  });

  test('retries run inside quiet hours, and a third failure leaves the reminder failed with no more attempts', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Sin Suerte', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Óscar', phone: '+34600150112', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-03-11T19:59:00Z', // Thursday 20:59 in Madrid: the reminder goes out Wednesday at 20:59
    });
    await makeNextRequestsBehaveAs({ to: '+34600150112', mode: 'unavailable', count: 3 });
    await setClock('2027-03-10T19:59:00Z'); // Wednesday 20:59 in Madrid
    await runReminderPass();
    await setClock('2027-03-10T20:00:00Z'); // 21:00 in Madrid, quiet hours
    await runReminderPass();
    await setClock('2027-03-10T20:05:00Z'); // 21:05 in Madrid, quiet hours

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'failed', attempts: 3, sentAt: null, skipReason: null }),
    ]);
    expect(await requestsReceivedFor('+34600150112')).toEqual([
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
    ]);

    await setClock('2027-03-11T08:00:00Z'); // the next morning, 09:00 in Madrid
    await runReminderPass();
    expect(await requestsReceivedFor('+34600150112')).toHaveLength(3);
    expect(await deliveredMessagesTo('+34600150112')).toEqual([]);
  });
});

describe('lost response (504 after delivering)', () => {
  test('the retry carries the same Idempotency-Key, the reminder becomes sent and the patient gets exactly one message', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Respuesta Perdida', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Pilar', phone: '+34600150113', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await makeNextRequestsBehaveAs({ to: '+34600150113', mode: 'lost-response', count: 1 });
    await setClock('2027-03-09T09:00:00Z');
    await runReminderPass();
    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'pending', attempts: 1, sentAt: null }),
    ]);
    await setClock('2027-03-09T09:01:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 2, sentAt: '2027-03-09T09:01:00.000Z' }),
    ]);
    const [lost, retry] = await requestsReceivedFor('+34600150113');
    expect(lost).toEqual(expect.objectContaining({ status: 504, idempotencyKey: expect.any(String) }));
    expect(retry).toEqual(expect.objectContaining({ status: 200, idempotencyKey: lost?.idempotencyKey }));
    expect(await deliveredMessagesTo('+34600150113')).toHaveLength(1);
  });
});

describe('provider rejection (422)', () => {
  test('the reminder becomes failed after one attempt and is never retried', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Rechazada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Quique', phone: '+34600150114', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await makeNextRequestsBehaveAs({ to: '+34600150114', mode: 'reject', count: 1 });
    await setClock('2027-03-09T09:00:00Z');
    await runReminderPass();
    await setClock('2027-03-09T09:01:00Z'); // when a retry after a 503 would be due
    await runReminderPass();
    await setClock('2027-03-09T09:06:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'failed', attempts: 1, sentAt: null, skipReason: null }),
    ]);
    expect(await requestsReceivedFor('+34600150114')).toEqual([expect.objectContaining({ status: 422 })]);
    expect(await deliveredMessagesTo('+34600150114')).toEqual([]);
  });
});

describe('concurrent passes', () => {
  test('five passes at once deliver exactly one message per reminder, with one provider call each', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Concurrida', timezone: 'Europe/Madrid' });
    const raquel = await createPatient({ clinicId: clinic.id, name: 'Raquel', phone: '+34600150115', acceptsReminders: true });
    const sergio = await createPatient({ clinicId: clinic.id, name: 'Sergio', phone: '+34600150116', acceptsReminders: true });
    const teresa = await createPatient({ clinicId: clinic.id, name: 'Teresa', phone: '+34600150117', acceptsReminders: true });
    const raquelAppointment = await createAppointment({ clinicId: clinic.id, patientId: raquel.id, startsAt: '2027-03-10T09:00:00Z' });
    const sergioAppointment = await createAppointment({ clinicId: clinic.id, patientId: sergio.id, startsAt: '2027-03-10T09:15:00Z' });
    const teresaAppointment = await createAppointment({ clinicId: clinic.id, patientId: teresa.id, startsAt: '2027-03-10T09:30:00Z' });
    await setClock('2027-03-09T09:30:00Z'); // all three reminders are due

    const responses = await Promise.all([runReminderPass(), runReminderPass(), runReminderPass(), runReminderPass(), runReminderPass()]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await deliveredMessagesTo('+34600150115')).toHaveLength(1);
    expect(await deliveredMessagesTo('+34600150116')).toHaveLength(1);
    expect(await deliveredMessagesTo('+34600150117')).toHaveLength(1);
    expect(await requestsReceivedFor('+34600150115')).toEqual([expect.objectContaining({ status: 202 })]);
    expect(await requestsReceivedFor('+34600150116')).toEqual([expect.objectContaining({ status: 202 })]);
    expect(await requestsReceivedFor('+34600150117')).toEqual([expect.objectContaining({ status: 202 })]);
    expect((await getAppointment(raquelAppointment.id)).reminders).toEqual([expect.objectContaining({ status: 'sent', attempts: 1 })]);
    expect((await getAppointment(sergioAppointment.id)).reminders).toEqual([expect.objectContaining({ status: 'sent', attempts: 1 })]);
    expect((await getAppointment(teresaAppointment.id)).reminders).toEqual([expect.objectContaining({ status: 'sent', attempts: 1 })]);
  });
});

describe('cancelled and rescheduled appointments', () => {
  test('a cancelled appointment does not send its reminder at the old time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cancelada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Úrsula', phone: '+34600150118', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('POST', `/appointments/${appointment.id}/cancel`);
    await setClock('2027-03-09T09:00:00Z');

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ status: 'cancelled', attempts: 0, sentAt: null }),
    ]);
    expect(await requestsReceivedFor('+34600150118')).toEqual([]);
  });

  test('a rescheduled appointment sends nothing at the old time and sends one message with the new time at the new reminder time', async () => {
    await setClock('2027-03-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Movida', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Víctor', phone: '+34600150119', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-03-10T09:00:00Z' });
    await request('PATCH', `/appointments/${appointment.id}`, {
      startsAt: '2027-03-12T10:00:00Z', // Friday 12/03/2027 11:00 in Madrid
    });
    await setClock('2027-03-09T09:00:00Z'); // the old reminder's time
    await runReminderPass();
    expect(await requestsReceivedFor('+34600150119')).toEqual([]);
    await setClock('2027-03-11T10:00:00Z'); // Thursday 11:00 in Madrid: the new reminder's time

    await runReminderPass();

    expect((await getAppointment(appointment.id)).reminders).toEqual([
      expect.objectContaining({ id: appointment.reminders[0]?.id, status: 'cancelled', attempts: 0, sentAt: null }),
      expect.objectContaining({ status: 'sent', attempts: 1, sentAt: '2027-03-11T10:00:00.000Z' }),
    ]);
    expect(await deliveredMessagesTo('+34600150119')).toEqual([
      expect.objectContaining({
        text: 'Hola Víctor, te recordamos tu cita en Clínica Movida el 12/03/2027 a las 11:00. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
  });
});
