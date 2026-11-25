import type { ClinicId } from '@/domain/clinic';
import type { PatientId } from '@/domain/patient';
import type { Reminder } from '@/domain/reminder';

export type AppointmentId = string & { readonly __brand: 'AppointmentId' };
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled';
export type Appointment = Readonly<{
  id: AppointmentId;
  clinicId: ClinicId;
  patientId: PatientId;
  startsAt: Date;
  status: AppointmentStatus;
  reminders: readonly Reminder[]; // oldest → newest
}>;
