import { makeCreateClinic } from '@/app/create-clinic';
import { repositories } from '@/infra/repositories';

export const createClinic = makeCreateClinic({ clinics: repositories.clinics });
