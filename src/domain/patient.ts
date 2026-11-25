import type { ClinicId } from '@/domain/clinic';

export type PatientId = string & { readonly __brand: 'PatientId' };
export type Phone = string & { readonly __brand: 'Phone' }; // E.164
export type Patient = Readonly<{
  id: PatientId;
  clinicId: ClinicId;
  name: string;
  phone: Phone | null;
  acceptsReminders: boolean;
}>;
