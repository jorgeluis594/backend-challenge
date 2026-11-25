import type { ClinicRepository } from '@/app/ports';
import type { Clinic, ClinicId, Timezone } from '@/domain/clinic';
import { db } from '@/infra/db';

type ClinicRow = Readonly<{ id: string; name: string; timezone: string }>;

const toClinic = (row: ClinicRow): Clinic => ({
  id: row.id as ClinicId,
  name: row.name,
  timezone: row.timezone as Timezone,
});

export const clinicRepository: ClinicRepository = {
  create: async (input) => toClinic(await db().clinic.create({ data: input })),
  findById: async ({ id }) => {
    const row = await db().clinic.findUnique({ where: { id } });
    if (!row) return null;
    return toClinic(row);
  },
};
