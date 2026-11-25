import { request } from 'tests/helpers/api';

// Response bodies as openapi.yaml defines them: dates travel as ISO 8601 strings in UTC.
export type ClinicBody = { id: string; name: string; timezone: string };
export type PatientBody = { id: string; clinicId: string; name: string; phone: string | null; acceptsReminders: boolean };
export type ReminderBody = {
  id: string;
  scheduledFor: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
  attempts: number;
  sentAt: string | null;
  skipReason: 'too_late' | 'no_phone' | 'opted_out' | null;
};
export type AppointmentBody = {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: string;
  status: 'scheduled' | 'confirmed' | 'cancelled';
  reminders: ReminderBody[];
};

// These create the state a test starts from. A failure here is a broken setup, not the
// behaviour under test, so they throw instead of returning the response to assert on.
async function create<T>(path: string, input: object): Promise<T> {
  const response = await request('POST', path, input);
  if (response.status !== 201) throw new Error(`POST ${path} answered ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body as T;
}

export function createClinic(input: { name: string; timezone: string }): Promise<ClinicBody> {
  return create<ClinicBody>('/clinics', input);
}

export function createPatient(input: {
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
}): Promise<PatientBody> {
  return create<PatientBody>('/patients', input);
}

export function createAppointment(input: { clinicId: string; patientId: string; startsAt: string }): Promise<AppointmentBody> {
  return create<AppointmentBody>('/appointments', input);
}
