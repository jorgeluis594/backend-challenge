import type { Prisma } from '@prisma/client';
import type { PatientRepository } from '@/app/ports';
import type { ClinicId } from '@/domain/clinic';
import type { Patient, PatientId, Phone } from '@/domain/patient';

type PatientRow = Readonly<{ id: string; clinicId: string; name: string; phone: string | null; acceptsReminders: boolean }>;

const toPatient = (row: PatientRow): Patient => ({
  id: row.id as PatientId,
  clinicId: row.clinicId as ClinicId,
  name: row.name,
  phone: row.phone as Phone | null,
  acceptsReminders: row.acceptsReminders,
});

export const makePatientRepository = (db: Prisma.TransactionClient): PatientRepository => ({
  create: async (input) => toPatient(await db.patient.create({ data: input })),
  findById: async ({ id }) => {
    const row = await db.patient.findUnique({ where: { id } });
    if (!row) return null;
    return toPatient(row);
  },
});
