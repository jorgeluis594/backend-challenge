import type { Prisma } from '@prisma/client';
import type { Repositories, Transaction } from '@/app/ports';
import { prisma } from '@/infra/db';
import { makeAppointmentRepository } from '@/infra/repositories/appointments';
import { makeClinicRepository } from '@/infra/repositories/clinics';
import { makeInboundMessageRepository } from '@/infra/repositories/inbound-messages';
import { makePatientRepository } from '@/infra/repositories/patients';
import { makeReminderRepository } from '@/infra/repositories/reminders';

export const makeRepositories = (db: Prisma.TransactionClient): Repositories => ({
  clinics: makeClinicRepository(db),
  patients: makePatientRepository(db),
  appointments: makeAppointmentRepository(db),
  reminders: makeReminderRepository(db),
  inboundMessages: makeInboundMessageRepository(db),
});

export const repositories = makeRepositories(prisma);

export const transaction: Transaction = (work) => prisma.$transaction((tx) => work(makeRepositories(tx)));
