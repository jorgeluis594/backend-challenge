import { makeCreateClinic } from '@/app/create-clinic';
import { clinicRepository } from '@/infra/repositories/clinics';

export const createClinic = makeCreateClinic({ clinics: clinicRepository });
