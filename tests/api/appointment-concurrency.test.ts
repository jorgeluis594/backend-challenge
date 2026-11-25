import { describe, expect, test } from 'vitest';
import { request, setClock } from 'tests/helpers/api';
import { type AppointmentBody, createAppointment, createClinic, createPatient } from 'tests/helpers/fixtures';

// Two operations on the same appointment that arrive at the same time run one after the
// other, each deciding on the state the other left. Rule 1: at most one pending reminder
// per appointment.
// Every time here is 10:00 in Madrid in January (CET, UTC+1), so each reminder goes out
// at 10:00 Madrid the day before: exactly 24 hours earlier.

describe('PATCH /appointments/:id sent several times at once', () => {
  test('every reschedule answers 200 and the appointment ends at one of the requested times with exactly one pending reminder for it', async () => {
    await setClock('2027-01-04T08:00:00Z');
    const clinic = await createClinic({ name: 'Clínica Reprogramaciones Simultáneas', timezone: 'Europe/Madrid' });
    const patient = await createPatient({ clinicId: clinic.id, name: 'Irene', phone: '+34600170101', acceptsReminders: true });
    const appointment = await createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      startsAt: '2027-01-20T09:00:00Z', // Wednesday 10:00 in Madrid
    });

    const responses = await Promise.all([
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-21T09:00:00Z' }),
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-22T09:00:00Z' }),
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-23T09:00:00Z' }),
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-24T09:00:00Z' }),
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-25T09:00:00Z' }),
      request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-26T09:00:00Z' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);

    const after = await request('GET', `/appointments/${appointment.id}`);
    const body = after.body as AppointmentBody;
    const reminderForStartsAt: Record<string, string> = {
      '2027-01-21T09:00:00.000Z': '2027-01-20T09:00:00.000Z',
      '2027-01-22T09:00:00.000Z': '2027-01-21T09:00:00.000Z',
      '2027-01-23T09:00:00.000Z': '2027-01-22T09:00:00.000Z',
      '2027-01-24T09:00:00.000Z': '2027-01-23T09:00:00.000Z',
      '2027-01-25T09:00:00.000Z': '2027-01-24T09:00:00.000Z',
      '2027-01-26T09:00:00.000Z': '2027-01-25T09:00:00.000Z',
    };
    expect(after.status).toBe(200);
    expect(Object.keys(reminderForStartsAt)).toContain(body.startsAt);
    expect(body.reminders.filter((reminder) => reminder.status === 'pending')).toEqual([
      expect.objectContaining({ scheduledFor: reminderForStartsAt[body.startsAt] }),
    ]);
    // The original reminder and the one of every reschedule but the last are cancelled.
    expect(body.reminders.filter((reminder) => reminder.status === 'cancelled')).toHaveLength(6);
  });
});

describe('PATCH /appointments/:id and POST /appointments/:id/cancel sent at once', () => {
  test.each([
    { round: 1, phone: '+34600170201' },
    { round: 2, phone: '+34600170202' },
    { round: 3, phone: '+34600170203' },
    { round: 4, phone: '+34600170204' },
    { round: 5, phone: '+34600170205' },
    { round: 6, phone: '+34600170206' },
    { round: 7, phone: '+34600170207' },
    { round: 8, phone: '+34600170208' },
    { round: 9, phone: '+34600170209' },
    { round: 10, phone: '+34600170210' },
  ])(
    'round $round: the cancel answers 200, the reschedule 200 or 409, and the appointment ends cancelled with no pending reminder',
    async ({ phone }) => {
      await setClock('2027-01-04T08:00:00Z');
      const clinic = await createClinic({ name: 'Clínica Cancelación Simultánea', timezone: 'Europe/Madrid' });
      const patient = await createPatient({ clinicId: clinic.id, name: 'Jaime', phone, acceptsReminders: true });
      const appointment = await createAppointment({
        clinicId: clinic.id,
        patientId: patient.id,
        startsAt: '2027-01-20T09:00:00Z', // Wednesday 10:00 in Madrid
      });

      const [reschedule, cancel] = await Promise.all([
        request('PATCH', `/appointments/${appointment.id}`, { startsAt: '2027-01-22T09:00:00Z' }),
        request('POST', `/appointments/${appointment.id}/cancel`),
      ]);

      expect(cancel.status).toBe(200);
      expect([200, 409]).toContain(reschedule.status);

      const after = await request('GET', `/appointments/${appointment.id}`);
      const body = after.body as AppointmentBody;
      expect(after.status).toBe(200);
      expect(body.status).toBe('cancelled');
      expect(body.reminders.filter((reminder) => reminder.status === 'pending')).toEqual([]);
    },
  );
});
