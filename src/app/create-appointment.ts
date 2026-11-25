import type { AppointmentRepository, ClinicRepository, PatientRepository } from '@/app/ports';
import { planReminder } from '@/app/plan-reminder';
import type { Appointment } from '@/domain/appointment';
import type { ClinicId } from '@/domain/clinic';
import type { PatientId } from '@/domain/patient';
import type { QuietHours } from '@/domain/reminder';
import { now } from '@/infra/clock';
import { fail, ok, type Result } from '@/shared/result';

export type CreateAppointmentInput = Readonly<{ clinicId: ClinicId; patientId: PatientId; startsAt: Date }>;
export type CreateAppointmentError = 'CLINIC_NOT_FOUND' | 'PATIENT_NOT_FOUND' | 'PATIENT_NOT_IN_CLINIC' | 'STARTS_AT_NOT_FUTURE';
export type CreateAppointmentDeps = Readonly<{
  clinics: ClinicRepository;
  patients: PatientRepository;
  appointments: AppointmentRepository;
  quietHours: QuietHours;
}>;

export const makeCreateAppointment =
  (deps: CreateAppointmentDeps) =>
  async (input: CreateAppointmentInput): Promise<Result<Appointment, CreateAppointmentError>> => {
    const clinic = await deps.clinics.findById({ id: input.clinicId });
    if (!clinic) return fail('CLINIC_NOT_FOUND');
    const patient = await deps.patients.findById({ id: input.patientId });
    if (!patient) return fail('PATIENT_NOT_FOUND');
    if (patient.clinicId !== clinic.id) return fail('PATIENT_NOT_IN_CLINIC');
    const at = now();
    if (input.startsAt <= at) return fail('STARTS_AT_NOT_FUTURE');
    const reminder = planReminder({ startsAt: input.startsAt, timezone: clinic.timezone, notBefore: at, quietHours: deps.quietHours });
    return ok(await deps.appointments.create({ ...input, reminder }));
  };
