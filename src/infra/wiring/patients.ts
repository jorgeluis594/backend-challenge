import { makeCreatePatient } from '@/app/create-patient';
import { repositories } from '@/infra/repositories';

export const createPatient = makeCreatePatient({ clinics: repositories.clinics, patients: repositories.patients });
