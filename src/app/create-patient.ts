import type { ClinicRepository, PatientRepository } from '@/app/ports';
import type { ClinicId } from '@/domain/clinic';
import type { Patient, Phone } from '@/domain/patient';
import { fail, ok, type Result } from '@/shared/result';

export type CreatePatientInput = Readonly<{ clinicId: ClinicId; name: string; phone: Phone | null; acceptsReminders: boolean }>;
export type CreatePatientError = 'CLINIC_NOT_FOUND';
export type CreatePatientDeps = Readonly<{ clinics: ClinicRepository; patients: PatientRepository }>;

export const makeCreatePatient =
  (deps: CreatePatientDeps) =>
  async (input: CreatePatientInput): Promise<Result<Patient, CreatePatientError>> => {
    const clinic = await deps.clinics.findById({ id: input.clinicId });
    if (!clinic) return fail('CLINIC_NOT_FOUND');
    return ok(await deps.patients.create(input));
  };
