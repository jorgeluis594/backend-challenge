import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { request, setClock } from 'tests/helpers/api';
import { type AppointmentBody, createAppointment, createClinic, createPatient } from 'tests/helpers/fixtures';

// The stack is shared: a pass may also treat reminders left by other tests. Every test uses its
// own clinic, patient and phone (prefix +34600160), and a fresh messageId, and asserts only on
// its own appointments. Quiet hours are the service defaults: from 21:00 to 09:00 local clinic
// time. In September Madrid is UTC+2 (CEST), so 10:00 in Madrid is 08:00Z.

function runReminderPass() {
  return request('POST', '/jobs/reminders/run');
}

function reply(input: { messageId: string; from: string; text: string; receivedAt: string }) {
  return request('POST', '/webhooks/inbound-messages', input);
}

async function getAppointment(id: string): Promise<AppointmentBody> {
  const response = await request('GET', `/appointments/${id}`);
  if (response.status !== 200) throw new Error(`GET /appointments/${id} answered ${response.status}`);
  return response.body as AppointmentBody;
}

/**
 * Setup shared by the tests that only need one appointment whose reminder was sent: a clinic in
 * Madrid, a patient with this phone and an appointment on Wednesday 15/09/2027 at 10:00 in Madrid.
 * Runs the pass at the reminder's time, Tuesday 14/09/2027 at 10:00 in Madrid, and leaves the
 * service clock there.
 */
async function appointmentWithSentReminder(phone: string): Promise<AppointmentBody> {
  await setClock('2027-09-01T08:00:00Z');
  const clinic = await createClinic({ name: 'Clínica Respuestas', timezone: 'Europe/Madrid' });
  const patient = await createPatient({ clinicId: clinic.id, name: 'Ana', phone, acceptsReminders: true });
  const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-09-15T08:00:00Z' });
  await setClock('2027-09-14T08:00:00Z');
  await runReminderPass();
  const [reminder] = (await getAppointment(appointment.id)).reminders;
  if (reminder?.status !== 'sent') throw new Error(`the reminder of ${phone} was not sent: ${JSON.stringify(reminder)}`);
  return appointment;
}

describe('a reply SI', () => {
  test('confirms the appointment that received the reminder, and answers 200', async () => {
    const appointment = await appointmentWithSentReminder('+34600160101');
    await setClock('2027-09-14T08:05:00Z');

    const response = await reply({ messageId: randomUUID(), from: '+34600160101', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' });

    expect(response.status).toBe(200);
    expect(await getAppointment(appointment.id)).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        reminders: [expect.objectContaining({ status: 'sent' })],
      }),
    );
  });
});

describe('a reply NO', () => {
  test('cancels the appointment that received the reminder, and answers 200', async () => {
    const appointment = await appointmentWithSentReminder('+34600160102');
    await setClock('2027-09-14T08:05:00Z');

    const response = await reply({ messageId: randomUUID(), from: '+34600160102', text: 'NO', receivedAt: '2027-09-14T08:05:00Z' });

    expect(response.status).toBe(200);
    expect(await getAppointment(appointment.id)).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        reminders: [expect.objectContaining({ status: 'sent' })],
      }),
    );
  });

  test('also cancels the pending reminder of an appointment rescheduled after its reminder was sent', async () => {
    const appointment = await appointmentWithSentReminder('+34600160103');
    await request('PATCH', `/appointments/${appointment.id}`, {
      startsAt: '2027-09-17T08:00:00Z', // Friday 17/09/2027 10:00 in Madrid: a new pending reminder for Thursday
    });
    await setClock('2027-09-14T08:05:00Z');

    await reply({ messageId: randomUUID(), from: '+34600160103', text: 'NO', receivedAt: '2027-09-14T08:05:00Z' });

    expect(await getAppointment(appointment.id)).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        reminders: [
          expect.objectContaining({ status: 'sent' }),
          expect.objectContaining({ scheduledFor: '2027-09-16T08:00:00.000Z', status: 'cancelled', attempts: 0, sentAt: null }),
        ],
      }),
    );
  });
});

describe('how the reply is written', () => {
  test.each([
    { text: 'SI', phone: '+34600160111' },
    { text: 'si', phone: '+34600160112' },
    { text: 'Sí', phone: '+34600160113' },
    { text: 'SÍ', phone: '+34600160114' },
    { text: 'si.', phone: '+34600160115' },
    { text: 'SI!', phone: '+34600160116' },
    { text: '  sí  ', phone: '+34600160117' },
    { text: '¡Sí!', phone: '+34600160118' },
  ])('"$text" confirms the appointment', async ({ text, phone }) => {
    const appointment = await appointmentWithSentReminder(phone);
    await setClock('2027-09-14T08:05:00Z');

    await reply({ messageId: randomUUID(), from: phone, text, receivedAt: '2027-09-14T08:05:00Z' });

    expect((await getAppointment(appointment.id)).status).toBe('confirmed');
  });

  test.each([
    { text: 'NO', phone: '+34600160121' },
    { text: 'no', phone: '+34600160122' },
    { text: 'No', phone: '+34600160123' },
    { text: 'no.', phone: '+34600160124' },
    { text: 'NO!', phone: '+34600160125' },
    { text: '  no  ', phone: '+34600160126' },
    { text: '¡No!', phone: '+34600160127' },
  ])('"$text" cancels the appointment', async ({ text, phone }) => {
    const appointment = await appointmentWithSentReminder(phone);
    await setClock('2027-09-14T08:05:00Z');

    await reply({ messageId: randomUUID(), from: phone, text, receivedAt: '2027-09-14T08:05:00Z' });

    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
  });

  test.each([
    { text: 'vale', phone: '+34600160131' },
    { text: 'Sí, gracias', phone: '+34600160132' },
    { text: 'no puedo ir', phone: '+34600160133' },
    { text: 'sino', phone: '+34600160134' },
    { text: '', phone: '+34600160135' },
  ])('"$text" is ignored: answers 200 and the appointment stays scheduled', async ({ text, phone }) => {
    const appointment = await appointmentWithSentReminder(phone);
    await setClock('2027-09-14T08:05:00Z');

    const response = await reply({ messageId: randomUUID(), from: phone, text, receivedAt: '2027-09-14T08:05:00Z' });

    expect(response.status).toBe(200);
    expect(await getAppointment(appointment.id)).toEqual(
      expect.objectContaining({
        status: 'scheduled',
        reminders: [expect.objectContaining({ status: 'sent' })],
      }),
    );
  });
});

describe('the same message delivered twice', () => {
  test('a repeated SI is not applied again after the confirmed appointment was rescheduled back to scheduled', async () => {
    const appointment = await appointmentWithSentReminder('+34600160141');
    const messageId = randomUUID();
    await setClock('2027-09-14T08:05:00Z');
    await reply({ messageId, from: '+34600160141', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' });
    await request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-09-17T08:00:00Z' });
    await setClock('2027-09-14T08:10:00Z');

    const response = await reply({ messageId, from: '+34600160141', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' });

    expect(response.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });
});

describe('which appointment the reply applies to', () => {
  test('the one whose reminder was sent most recently, even if it was created before the other', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Dos Citas', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Bea', phone: '+34600160151', acceptsReminders: true });
    const createdFirst = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-21T16:00:00Z', // Tuesday 21/09/2027 18:00 in Madrid: reminder Monday 18:00
    });
    const createdSecond = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-21T08:00:00Z', // Tuesday 21/09/2027 10:00 in Madrid: reminder Monday 10:00
    });
    await setClock('2027-09-20T08:00:00Z'); // Monday 10:00 in Madrid: the second one's reminder is sent
    await runReminderPass();
    await setClock('2027-09-20T16:00:00Z'); // Monday 18:00 in Madrid: the first one's reminder is sent
    await runReminderPass();
    await setClock('2027-09-20T16:05:00Z');

    await reply({ messageId: randomUUID(), from: '+34600160151', text: 'SI', receivedAt: '2027-09-20T16:05:00Z' });

    expect((await getAppointment(createdFirst.id)).status).toBe('confirmed');
    expect((await getAppointment(createdSecond.id)).status).toBe('scheduled');
  });

  test('the one whose reminder was sent most recently, even if it starts before the other', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Cita Urgente', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Carlos', phone: '+34600160152', acceptsReminders: true });
    const later = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-10T08:00:00Z', // Friday 10/09/2027 10:00 in Madrid: reminder Thursday 10:00
    });
    await setClock('2027-09-09T08:00:00Z'); // Thursday 10:00 in Madrid
    await runReminderPass();
    await setClock('2027-09-09T09:00:00Z'); // Thursday 11:00 in Madrid
    const sooner = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-09T14:00:00Z', // Thursday 16:00 in Madrid: the day-before time passed, the reminder goes out now
    });
    await runReminderPass();
    await setClock('2027-09-09T09:05:00Z');

    await reply({ messageId: randomUUID(), from: '+34600160152', text: 'SI', receivedAt: '2027-09-09T09:05:00Z' });

    expect((await getAppointment(sooner.id)).status).toBe('confirmed');
    expect((await getAppointment(later.id)).status).toBe('scheduled');
  });

  test('an appointment that starts exactly at the time of the reply is skipped, and the reply goes to the previous reminded one', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Ya Empezada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Dácil', phone: '+34600160153', acceptsReminders: true });
    const notStarted = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-10T08:00:00Z', // Friday 10/09/2027 10:00 in Madrid: reminder Thursday 10:00
    });
    await setClock('2027-09-09T08:00:00Z');
    await runReminderPass();
    await setClock('2027-09-09T09:00:00Z'); // Thursday 11:00 in Madrid
    const started = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-09T09:30:00Z', // Thursday 11:30 in Madrid: the reminder goes out now
    });
    await runReminderPass();
    await setClock('2027-09-09T09:30:00Z'); // the second appointment starts now

    await reply({ messageId: randomUUID(), from: '+34600160153', text: 'SI', receivedAt: '2027-09-09T09:30:00Z' });

    expect((await getAppointment(notStarted.id)).status).toBe('confirmed');
    expect((await getAppointment(started.id)).status).toBe('scheduled');
  });

  test('a cancelled appointment is skipped, and the reply goes to the previous reminded one', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Anulada', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Elena', phone: '+34600160154', acceptsReminders: true });
    const remindedFirst = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-21T08:00:00Z', // reminder Monday 20/09/2027 10:00 in Madrid
    });
    const remindedLast = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-09-21T16:00:00Z', // reminder Monday 20/09/2027 18:00 in Madrid
    });
    await setClock('2027-09-20T08:00:00Z');
    await runReminderPass();
    await setClock('2027-09-20T16:00:00Z');
    await runReminderPass();
    await request('POST', `/appointments/${remindedLast.id}/cancel`);
    await setClock('2027-09-20T16:05:00Z');

    await reply({ messageId: randomUUID(), from: '+34600160154', text: 'SI', receivedAt: '2027-09-20T16:05:00Z' });

    expect((await getAppointment(remindedFirst.id)).status).toBe('confirmed');
    expect((await getAppointment(remindedLast.id)).status).toBe('cancelled');
  });

  test('when two patients share the phone, it goes to the appointment of whichever was reminded last', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Familiar', timezone: 'Europe/Madrid' });
    const mother = await createPatient({ clinicId: clinic.id, name: 'Fátima', phone: '+34600160155', acceptsReminders: true });
    const son = await createPatient({ clinicId: clinic.id, name: 'Gonzalo', phone: '+34600160155', acceptsReminders: true });
    const motherAppointment = await createAppointment({
      clinicId: clinic.id,
      patientId: mother.id,
      startsAt: '2027-09-21T08:00:00Z', // reminder Monday 20/09/2027 10:00 in Madrid
    });
    const sonAppointment = await createAppointment({
      clinicId: clinic.id,
      patientId: son.id,
      startsAt: '2027-09-21T16:00:00Z', // reminder Monday 20/09/2027 18:00 in Madrid
    });
    await setClock('2027-09-20T08:00:00Z');
    await runReminderPass();
    await setClock('2027-09-20T16:00:00Z');
    await runReminderPass();
    await setClock('2027-09-20T16:05:00Z');

    await reply({ messageId: randomUUID(), from: '+34600160155', text: 'NO', receivedAt: '2027-09-20T16:05:00Z' });

    expect((await getAppointment(sonAppointment.id)).status).toBe('cancelled');
    expect((await getAppointment(motherAppointment.id)).status).toBe('scheduled');
  });
});

describe('a reply with no appointment to apply to', () => {
  test('from a phone whose reminder is still pending, answers 200 and the appointment does not change', async () => {
    await setClock('2027-09-01T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Prisa', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Hugo', phone: '+34600160161', acceptsReminders: true });
    const appointment = await createAppointment({ clinicId: clinic.id, patientId: patient.id, startsAt: '2027-09-15T08:00:00Z' });

    const response = await reply({ messageId: randomUUID(), from: '+34600160161', text: 'SI', receivedAt: '2027-09-01T08:00:00Z' });

    expect(response.status).toBe(200);
    expect(await getAppointment(appointment.id)).toEqual(
      expect.objectContaining({
        status: 'scheduled',
        reminders: [expect.objectContaining({ status: 'pending' })],
      }),
    );
  });

  test('from a phone whose only reminded appointment already started, answers 200 and the appointment does not change', async () => {
    const appointment = await appointmentWithSentReminder('+34600160162');
    await setClock('2027-09-15T08:30:00Z'); // half an hour after the appointment started

    const response = await reply({ messageId: randomUUID(), from: '+34600160162', text: 'NO', receivedAt: '2027-09-15T08:30:00Z' });

    expect(response.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });

  test('from a number no patient has, answers 200', async () => {
    await setClock('2027-09-14T08:05:00Z');

    const response = await reply({ messageId: randomUUID(), from: '+34600160163', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' });

    expect(response.status).toBe(200);
  });
});

describe('a SI after a NO', () => {
  test('is ignored: the appointment stays cancelled', async () => {
    const appointment = await appointmentWithSentReminder('+34600160171');
    await setClock('2027-09-14T08:05:00Z');
    await reply({ messageId: randomUUID(), from: '+34600160171', text: 'NO', receivedAt: '2027-09-14T08:05:00Z' });
    await setClock('2027-09-14T08:10:00Z');

    const response = await reply({ messageId: randomUUID(), from: '+34600160171', text: 'SI', receivedAt: '2027-09-14T08:10:00Z' });

    expect(response.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
  });
});

describe('a body that breaks the schema', () => {
  test.each([
    { case: 'without messageId', body: { from: '+34600160181', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' } },
    { case: 'without from', body: { messageId: 'schema-1', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' } },
    { case: 'without text', body: { messageId: 'schema-2', from: '+34600160181', receivedAt: '2027-09-14T08:05:00Z' } },
    { case: 'without receivedAt', body: { messageId: 'schema-3', from: '+34600160181', text: 'SI' } },
    { case: 'with a numeric messageId', body: { messageId: 42, from: '+34600160181', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' } },
    { case: 'with a numeric text', body: { messageId: 'schema-4', from: '+34600160181', text: 1, receivedAt: '2027-09-14T08:05:00Z' } },
    { case: 'with receivedAt that is not a date', body: { messageId: 'schema-5', from: '+34600160181', text: 'SI', receivedAt: 'ayer' } },
    { case: 'with receivedAt without offset', body: { messageId: 'schema-6', from: '+34600160181', text: 'SI', receivedAt: '2027-09-14T08:05:00' } },
  ])('$case answers 400 with an error', async ({ body }) => {
    const response = await request('POST', '/webhooks/inbound-messages', body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  test('a SI without receivedAt does not confirm the appointment', async () => {
    const appointment = await appointmentWithSentReminder('+34600160182');
    await setClock('2027-09-14T08:05:00Z');

    await request('POST', '/webhooks/inbound-messages', { messageId: randomUUID(), from: '+34600160182', text: 'SI' });

    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });
});

describe('PATCH /appointments/:id on a confirmed appointment', () => {
  test('rescheduling it returns it to scheduled, because the confirmation was for the old time', async () => {
    const appointment = await appointmentWithSentReminder('+34600160191');
    await setClock('2027-09-14T08:05:00Z');
    await reply({ messageId: randomUUID(), from: '+34600160191', text: 'SI', receivedAt: '2027-09-14T08:05:00Z' });
    expect((await getAppointment(appointment.id)).status).toBe('confirmed');

    const response = await request('PATCH', `/appointments/${appointment.id}`, {
      startsAt: '2027-09-17T08:00:00Z', // Friday 17/09/2027 10:00 in Madrid
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'scheduled', startsAt: '2027-09-17T08:00:00.000Z' }));
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });
});
