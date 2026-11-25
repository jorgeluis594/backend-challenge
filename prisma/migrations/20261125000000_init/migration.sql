-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('too_late', 'no_phone', 'opted_out');

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "accepts_reminders" BOOLEAN NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "seq" SERIAL NOT NULL,
    "appointment_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(3),
    "skip_reason" "SkipReason",

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "message_id" TEXT NOT NULL,
    "from_phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_seq_key" ON "reminders"("seq");

-- CreateIndex
CREATE INDEX "reminders_appointment_id_seq_idx" ON "reminders"("appointment_id", "seq");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Written by hand: schema.prisma cannot express these.

-- Rule 1: at most one live reminder per appointment
CREATE UNIQUE INDEX "reminders_one_pending_per_appointment" ON "reminders" ("appointment_id") WHERE "status" = 'pending';

-- The queue: what the send pass scans
CREATE INDEX "reminders_due" ON "reminders" ("next_attempt_at") WHERE "status" = 'pending';

-- Columns that only make sense in one status
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_skip_reason_iff_skipped" CHECK (("status" = 'skipped') = ("skip_reason" IS NOT NULL));
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_sent_at_iff_sent" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL));
