import { makeCreatePatient } from '@/app/create-patient';
import { clinicRepository } from '@/infra/repositories/clinics';
import { patientRepository } from '@/infra/repositories/patients';

export const createPatient = makeCreatePatient({ clinics: clinicRepository, patients: patientRepository });
