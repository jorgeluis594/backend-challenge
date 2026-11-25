import type { ClinicRepository } from '@/app/ports';
import type { Clinic, Timezone } from '@/domain/clinic';

export type CreateClinicInput = Readonly<{ name: string; timezone: Timezone }>;
export type CreateClinicDeps = Readonly<{ clinics: ClinicRepository }>;

export const makeCreateClinic =
  (deps: CreateClinicDeps) =>
  (input: CreateClinicInput): Promise<Clinic> =>
    deps.clinics.create(input);
