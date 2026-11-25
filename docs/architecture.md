# Architecture

How this service is built. The statement (`enunciado.pdf`) and `openapi.yaml` define **what** it does; this document defines **how**. If a task needs something this document does not cover, stop and ask instead of inventing it.

## 1. Stack

| Concern | Choice |
|---|---|
| Runtime | Node ≥ 22, TypeScript strict, run directly with `tsx` (no build output); `tsc --noEmit` only typechecks |
| HTTP | Express 5 (async errors reach the error handler) + Zod 4 |
| Data | PostgreSQL 16 through Prisma 6 (classic `schema.prisma` setup, no driver adapter) |
| Dates | Luxon |
| Tests | Vitest, with the `@/` alias configured (`vite-tsconfig-paths`) |
| Lint | ESLint, relative imports forbidden |

## 2. Layers and folders

Three folders, one question each:

- **`domain/`** — what the data looks like. Types only, one file per entity. No functions.
- **`app/`** — all the logic. One file per use case. Some use cases persist and some only compute; both live here.
- **`infra/`** — everything that touches the outside world: database, provider, HTTP, environment, clock.

```
prisma/
  schema.prisma
  migrations/
src/
  shared/
    result.ts                   Result<T, E>, ok, fail
  domain/                       types only
    clinic.ts                   ClinicId, Timezone, Clinic
    patient.ts                  PatientId, Phone, Patient
    appointment.ts              AppointmentId, AppointmentStatus, Appointment
    reminder.ts                 ReminderId, Reminder, SkipReason, ReminderPlan, QuietHours, …
    inbound-message.ts          InboundMessage, Reply
  app/                          one use case per file
    ports.ts                    contracts the use cases depend on
    create-clinic.ts
    create-patient.ts
    create-appointment.ts
    get-appointment.ts
    reschedule-appointment.ts
    cancel-appointment.ts
    run-reminder-pass.ts
    handle-inbound-message.ts
    plan-reminder.ts            computes only
    decide-send.ts              computes only
    reminder-text.ts            computes only
    after-attempt.ts            computes only
    parse-reply.ts              computes only
  infra/
    config.ts                   environment, validated with Zod at startup
    clock.ts                    now(), setClock()
    db.ts                       PrismaClient
    repositories/               one file per repository + index.ts
    provider/client.ts          sendMessage
    wiring/                     injects real dependencies into the use cases, exports them ready
    http/
      app.ts                    Express app, JSON parsing, 404, error handler
      schemas.ts                Zod schemas; the only place that turns raw input into domain types
      errors.ts                 use-case error → HTTP status and message
      routes/                   one file per resource
  main.ts                       connect and listen
tests/
  api/                          end-to-end over HTTP, full compose stack
  helpers/
```

Dependency direction:

- `domain` imports only other `domain` files.
- `app` imports `domain`, `shared`, other `app` files, and **one** thing from infra: `now` from `@/infra/clock`.
- `infra` imports anything.
- Routes import ready use cases from `@/infra/wiring/*`; they never import an `app` file or a repository. Two exceptions: the health route imports `@/infra/db` and the clock route imports `setClock`.

## 3. Conventions

1. **Absolute imports only**: `@/domain/...`, `@/app/...`, `@/infra/...`, `@/shared/...`. Never `./` or `../`.
2. **One named-object argument** for every use case and repository method: `getAppointment({ id })`. Exceptions: `parseReply(text)`, `setClock(date)`, `transaction(work)` and the functions that take nothing (`now()`, `runReminderPass()`).
3. **Two kinds of use case, same folder.**
   - One that needs the database, the provider or the clock is a closure: `makeX(deps)` returns `x(input)`. `deps` lists exactly what it uses.
   - One that only computes is a plain exported function with no `deps`. It never reads the clock: the instant comes as an argument named by intent (`notBefore`, `at`, `attemptedAt`).
4. **Each use-case file exports its own types**: `XInput`, `XError` (when it can fail) and `XDeps` (when it has dependencies), next to the function.
5. **Expected failures are values**: `Result<T, E>` where `E` is a union of string literals. `throw` is only for bugs and infrastructure failures; the HTTP error handler turns those into 500.
6. **Never `new Date()` for the current time.** Call `now()` from `@/infra/clock`, only inside closure use cases.
7. **UTC everywhere.** Instants are `Date` in code and `timestamptz` in the database. The clinic timezone is used in exactly two places: `planReminder` and `reminderText`.
8. **Strong typing** (section 5): branded ids and values, `Readonly` entities, discriminated unions instead of nullable combinations. No `any`, no non-null `!`.
9. **`as` only where a brand is minted**: the Zod schemas in `infra/http/schemas.ts` (input) and the row mappers in `infra/repositories/` (database). Nowhere else in `src/`. Test files may use `as` to build branded values.
10. **Exhaustiveness**: every `switch` over a union ends in a `never` check, and the error-to-status map is typed `Record<ErrorUnion, …>` so a new error does not compile until it is mapped.

## 4. Data model

Five tables. All ids are UUIDs (generated by Prisma on insert). The reminder id is also the provider `Idempotency-Key`.

```prisma
enum AppointmentStatus { scheduled confirmed cancelled }
enum ReminderStatus    { pending sent failed skipped cancelled }
enum SkipReason        { too_late no_phone opted_out }

model Clinic {
  id       String @id @default(uuid()) @db.Uuid
  name     String
  timezone String
  @@map("clinics")
}

model Patient {
  id               String  @id @default(uuid()) @db.Uuid
  clinicId         String  @map("clinic_id") @db.Uuid
  name             String
  phone            String?
  acceptsReminders Boolean @map("accepts_reminders")
  clinic           Clinic  @relation(fields: [clinicId], references: [id])
  @@index([phone])
  @@map("patients")
}

model Appointment {
  id        String            @id @default(uuid()) @db.Uuid
  clinicId  String            @map("clinic_id") @db.Uuid
  patientId String            @map("patient_id") @db.Uuid
  startsAt  DateTime          @map("starts_at") @db.Timestamptz(3)
  status    AppointmentStatus @default(scheduled)
  clinic    Clinic            @relation(fields: [clinicId], references: [id])
  patient   Patient           @relation(fields: [patientId], references: [id])
  reminders Reminder[]
  @@index([patientId])
  @@map("appointments")
}

model Reminder {
  id            String         @id @default(uuid()) @db.Uuid
  seq           Int            @unique @default(autoincrement())   // creation order
  appointmentId String         @map("appointment_id") @db.Uuid
  scheduledFor  DateTime       @map("scheduled_for") @db.Timestamptz(3)    // fixed: when it was due
  nextAttemptAt DateTime       @map("next_attempt_at") @db.Timestamptz(3)  // internal: moves on each retry
  status        ReminderStatus
  attempts      Int            @default(0)                          // calls made to the provider
  sentAt        DateTime?      @map("sent_at") @db.Timestamptz(3)
  skipReason    SkipReason?    @map("skip_reason")
  appointment   Appointment    @relation(fields: [appointmentId], references: [id])
  @@index([appointmentId, seq])
  @@map("reminders")
}

model InboundMessage {
  messageId  String   @id @map("message_id")
  fromPhone  String   @map("from_phone")
  text       String
  receivedAt DateTime @map("received_at") @db.Timestamptz(3)
  @@map("inbound_messages")
}
```

Added by hand to the migration SQL, because `schema.prisma` cannot express them:

```sql
-- Rule 1: at most one live reminder per appointment
CREATE UNIQUE INDEX reminders_one_pending_per_appointment ON reminders (appointment_id) WHERE status = 'pending';
-- The queue: what the send pass scans
CREATE INDEX reminders_due ON reminders (next_attempt_at) WHERE status = 'pending';
-- Columns that only make sense in one status
ALTER TABLE reminders ADD CONSTRAINT reminders_skip_reason_iff_skipped CHECK ((status = 'skipped') = (skip_reason IS NOT NULL));
ALTER TABLE reminders ADD CONSTRAINT reminders_sent_at_iff_sent       CHECK ((status = 'sent') = (sent_at IS NOT NULL));
```

There is a single migration, created in T0 with all five tables. No later task adds one, and nobody runs `prisma migrate dev` after it: it would generate a migration that drops the hand-written indexes.

Invariants the code relies on:

- A `pending` reminder always belongs to an appointment that is not cancelled (cancelling cancels it in the same transaction). The send pass therefore never checks the appointment status.
- `scheduled_for` never changes after insert. `next_attempt_at` starts equal to it.
- The reminders of an appointment are listed by `seq`, never by a timestamp (the test clock can freeze time).

## 5. Types (`domain/`)

Types only. Written by hand; they do not depend on Prisma or Zod types.

Three techniques, used everywhere:

- **Branded ids and values.** A `ClinicId` cannot be passed where a `PatientId` is expected, and a `Phone` is a string that already passed the E.164 check.
- **`Readonly` entities.** A use case builds a new value; it never mutates one.
- **Discriminated unions.** A reminder that is `sent` always has `sentAt`; one that is `skipped` always has `skipReason`. The impossible combinations do not typecheck.

```ts
// shared/result.ts
export type Result<T, E extends string> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: E }>;
export const ok = <T>(data: T) => ({ success: true as const, data });
export const fail = <E extends string>(error: E) => ({ success: false as const, error });
```

```ts
// domain/clinic.ts
export type ClinicId = string & { readonly __brand: 'ClinicId' };
export type Timezone = string & { readonly __brand: 'Timezone' };   // an IANA zone that exists
export type Clinic = Readonly<{ id: ClinicId; name: string; timezone: Timezone }>;
```

```ts
// domain/patient.ts
export type PatientId = string & { readonly __brand: 'PatientId' };
export type Phone = string & { readonly __brand: 'Phone' };         // E.164
export type Patient = Readonly<{
  id: PatientId;
  clinicId: ClinicId;
  name: string;
  phone: Phone | null;
  acceptsReminders: boolean;
}>;
```

```ts
// domain/reminder.ts
export type ReminderId = string & { readonly __brand: 'ReminderId' };   // also the provider Idempotency-Key
export type SkipReason = 'too_late' | 'no_phone' | 'opted_out';

type ReminderBase = Readonly<{ id: ReminderId; scheduledFor: Date; attempts: number }>;
export type Reminder = ReminderBase & (
  | Readonly<{ status: 'pending' | 'failed' | 'cancelled'; sentAt: null; skipReason: null }>
  | Readonly<{ status: 'sent'; sentAt: Date; skipReason: null }>
  | Readonly<{ status: 'skipped'; sentAt: null; skipReason: SkipReason }>
);
export type ReminderStatus = Reminder['status'];

export type QuietHours = Readonly<{ from: number; until: number }>;     // local clinic hours, 0–23

/** How a reminder is born. */
export type ReminderPlan =
  | Readonly<{ status: 'pending'; scheduledFor: Date }>
  | Readonly<{ status: 'skipped'; scheduledFor: Date; skipReason: 'too_late' }>;

/** What to do right before calling the provider. */
export type SendDecision =
  | Readonly<{ action: 'send'; to: Phone }>
  | Readonly<{ action: 'skip'; reason: SkipReason }>;

/** What the provider answered. */
export type SendOutcome = 'delivered' | 'rejected' | 'not_delivered' | 'unknown';

/** How a reminder ends a pass. Also what the repository stores. */
export type ReminderSettlement =
  | Readonly<{ status: 'sent'; attempts: number; sentAt: Date }>
  | Readonly<{ status: 'failed'; attempts: number }>
  | Readonly<{ status: 'pending'; attempts: number; nextAttemptAt: Date }>
  | Readonly<{ status: 'skipped'; skipReason: SkipReason }>;
```

```ts
// domain/appointment.ts
export type AppointmentId = string & { readonly __brand: 'AppointmentId' };
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled';
export type Appointment = Readonly<{
  id: AppointmentId;
  clinicId: ClinicId;
  patientId: PatientId;
  startsAt: Date;
  status: AppointmentStatus;
  reminders: readonly Reminder[];       // oldest → newest
}>;
```

```ts
// domain/inbound-message.ts
export type InboundMessage = Readonly<{ messageId: string; from: string; text: string; receivedAt: Date }>;
export type Reply = 'confirm' | 'cancel';
```

`Clinic`, `Patient`, `Appointment` and `Reminder` are exactly the response bodies of `openapi.yaml`: routes return them as they are, and `res.json` serialises each `Date` as UTC with `Z`. `seq` and `nextAttemptAt` exist only in the database and never appear in an entity.

Where brands are minted (the only two places with `as`):

- **Input**: `infra/http/schemas.ts`. `Timezone` passes `IANAZone.isValidZone`; `Phone` passes `^\+[1-9]\d{7,14}$`; ids pass a UUID check.
- **Database**: the row mappers in `infra/repositories/`, which also build the `Reminder` union from the row's `status`.

## 6. Ports (`app/ports.ts`)

What the use cases need from the outside. `infra` implements them.

```ts
export type ClinicRepository = Readonly<{
  create(input: { name: string; timezone: Timezone }): Promise<Clinic>;
  findById(input: { id: ClinicId }): Promise<Clinic | null>;
}>;

export type PatientRepository = Readonly<{
  create(input: { clinicId: ClinicId; name: string; phone: Phone | null; acceptsReminders: boolean }): Promise<Patient>;
  findById(input: { id: PatientId }): Promise<Patient | null>;
}>;

export type AppointmentRepository = Readonly<{
  /** Inserts the appointment and its first reminder atomically. */
  create(input: { clinicId: ClinicId; patientId: PatientId; startsAt: Date; reminder: ReminderPlan }): Promise<Appointment>;
  findById(input: { id: AppointmentId }): Promise<Appointment | null>;
  update(input: { id: AppointmentId; startsAt?: Date; status?: AppointmentStatus }): Promise<void>;
  /** The appointment that received the most recently SENT reminder to that phone
      (reminders with status 'sent', ORDER BY sent_at DESC, seq DESC, LIMIT 1), among appointments
      that are not cancelled and start after `at`. */
  findLastRemindedByPhone(input: { phone: string; at: Date }): Promise<{ id: AppointmentId } | null>;
}>;

/** A pending reminder with everything needed to decide and send it. */
export type DueReminder = Readonly<{
  id: ReminderId;
  attempts: number;
  appointment: Readonly<{ startsAt: Date }>;
  patient: Readonly<{ name: string; phone: Phone | null; acceptsReminders: boolean }>;
  clinic: Readonly<{ name: string; timezone: Timezone }>;
}>;

export type ReminderRepository = Readonly<{
  create(input: { appointmentId: AppointmentId; plan: ReminderPlan }): Promise<void>;
  /** pending → cancelled for that appointment. No-op when there is none. */
  cancelPending(input: { appointmentId: AppointmentId }): Promise<void>;
  /** Every pending reminder with next_attempt_at <= at (ORDER BY next_attempt_at, seq),
      each with its appointment, patient and clinic. */
  findDue(input: { at: Date }): Promise<readonly DueReminder[]>;
  /** Writes only if the reminder is still pending (WHERE status = 'pending'). */
  settle(input: { id: ReminderId; settlement: ReminderSettlement }): Promise<void>;
}>;

export type InboundMessageRepository = Readonly<{
  /** false when that messageId was already stored. */
  insertIfNew(input: InboundMessage): Promise<boolean>;
}>;

export type Repositories = Readonly<{
  clinics: ClinicRepository;
  patients: PatientRepository;
  appointments: AppointmentRepository;
  reminders: ReminderRepository;
  inboundMessages: InboundMessageRepository;
}>;

/** Runs `work` in one database transaction, with repositories bound to it. */
export type Transaction = <T>(work: (repos: Repositories) => Promise<T>) => Promise<T>;

export type ProviderClient = Readonly<{
  sendMessage(input: { to: Phone; text: string; idempotencyKey: ReminderId }): Promise<SendOutcome>;
}>;
```

Repository rules:

- A `pending` plan is stored with `next_attempt_at = scheduled_for`; a `skipped` plan is stored with its reason.
- Every `Appointment` returned carries its reminders ordered by `seq`.
- There is no raw SQL and no row lock anywhere: every query goes through the Prisma client.
- `insertIfNew` needs no raw SQL: `createMany({ data: [row], skipDuplicates: true })` and `count === 1`.

## 7. Use cases that only compute

Plain functions, no `deps`, no I/O. Unit-tested with tables of inputs and outputs.

```ts
// plan-reminder.ts — when the reminder goes out (rules 2 to 5)
planReminder(input: { startsAt: Date; timezone: Timezone; notBefore: Date; quietHours: QuietHours }): ReminderPlan

// decide-send.ts — send or skip, right before each attempt (rules 5 and 6)
decideSend(input: { startsAt: Date; phone: Phone | null; acceptsReminders: boolean; at: Date }): SendDecision

// reminder-text.ts — the exact text (rule 7)
reminderText(input: { patientName: string; clinicName: string; startsAt: Date; timezone: Timezone }): string

// after-attempt.ts — what happens after a provider call. `attempt` is the one just made: 1, 2 or 3
afterAttempt(input: { outcome: SendOutcome; attempt: number; attemptedAt: Date }): ReminderSettlement

// parse-reply.ts
parseReply(text: string): Reply | null
```

Rules inside each one:

- **`planReminder`**: same local time on the previous calendar day in the clinic timezone (`minus({ days: 1 })`, not 24 h); moved out of quiet hours; if that is before `notBefore`, use `notBefore` and move out of quiet hours again; `skipped` with `too_late` when the result is not strictly before `startsAt`. Quiet hours: at `from` o'clock sending is already forbidden, at `until` o'clock it is allowed.
- **`decideSend`**, checked in this order: `too_late` when `at >= startsAt`; `no_phone` when `phone` is null; `opted_out` when `acceptsReminders` is false. Otherwise `send`, carrying the non-null phone as `to`.
- **`reminderText`**: `Hola {patientName}, te recordamos tu cita en {clinicName} el {dd/MM/yyyy} a las {HH:mm}. Responde SI para confirmar o NO para cancelar.` with the date and time of `startsAt` in the clinic timezone.
- **`afterAttempt`**: `delivered` → `sent` with `sentAt = attemptedAt`; `rejected` → `failed`; `not_delivered` or `unknown` → attempt 1: `pending` at +1 min, attempt 2: `pending` at +5 min, attempt 3 or more: `failed`. `attempts` in the result is `attempt`. Retries ignore quiet hours.
- **`parseReply`**: strip accents, lowercase, trim anything that is not a letter or digit from both ends; `si` → `confirm`, `no` → `cancel`, anything else → `null`.

Reference implementation of the scheduling rule (verified against the DST and Canary cases of the statement):

```ts
export function planReminder(input: PlanReminderInput): ReminderPlan {
  const start    = DateTime.fromJSDate(input.startsAt,  { zone: input.timezone });
  const earliest = DateTime.fromJSDate(input.notBefore, { zone: input.timezone });
  const dayBefore = outOfQuietHours(start.minus({ days: 1 }), input.quietHours);
  const at = laterOf(dayBefore, outOfQuietHours(earliest, input.quietHours));
  const scheduledFor = at.toJSDate();
  if (at < start) return { status: 'pending', scheduledFor };
  return { status: 'skipped', scheduledFor, skipReason: 'too_late' };
}

function laterOf(a: DateTime, b: DateTime): DateTime {
  if (a < b) return b;
  return a;
}

function outOfQuietHours(t: DateTime, quietHours: QuietHours): DateTime {
  if (!isQuiet(t.hour, quietHours)) return t;
  const end = t.set({ hour: quietHours.until, minute: 0, second: 0, millisecond: 0 });
  const endsNextDay = quietHours.from > quietHours.until && t.hour >= quietHours.from;
  if (endsNextDay) return end.plus({ days: 1 });
  return end;
}

function isQuiet(hour: number, { from, until }: QuietHours): boolean {
  if (from > until) return hour >= from || hour < until;   // the period crosses midnight
  return hour >= from && hour < until;
}
```

## 8. Use cases that persist

Closures. Each file exports `makeX`, and the types `XInput`, `XError`, `XDeps`. Signatures below are those of the returned function.

### `createClinic` — deps `{ clinics }`

```ts
(input: { name: string; timezone: Timezone }) => Promise<Clinic>
```
Cannot fail: an invalid timezone never becomes a `Timezone`.

### `createPatient` — deps `{ clinics, patients }`

```ts
(input: { clinicId: ClinicId; name: string; phone: Phone | null; acceptsReminders: boolean }) =>
  Promise<Result<Patient, 'CLINIC_NOT_FOUND'>>
```

### `createAppointment` — deps `{ clinics, patients, appointments, quietHours }`

```ts
(input: { clinicId: ClinicId; patientId: PatientId; startsAt: Date }) =>
  Promise<Result<Appointment, 'CLINIC_NOT_FOUND' | 'PATIENT_NOT_FOUND' | 'PATIENT_NOT_IN_CLINIC' | 'STARTS_AT_NOT_FUTURE'>>
```
1. Clinic missing → `CLINIC_NOT_FOUND`. Patient missing → `PATIENT_NOT_FOUND`. Patient of another clinic → `PATIENT_NOT_IN_CLINIC`.
2. `const at = now()`; `startsAt <= at` → `STARTS_AT_NOT_FUTURE`.
3. `planReminder({ startsAt, timezone: clinic.timezone, notBefore: at, quietHours })`.
4. `appointments.create(...)` with that plan. No explicit transaction: the insert is atomic.

### `getAppointment` — deps `{ appointments }`

```ts
(input: { id: AppointmentId }) => Promise<Result<Appointment, 'APPOINTMENT_NOT_FOUND'>>
```

### `rescheduleAppointment` — deps `{ transaction, quietHours }`

```ts
(input: { id: AppointmentId; startsAt: Date }) =>
  Promise<Result<Appointment, 'APPOINTMENT_NOT_FOUND' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_STARTED' | 'STARTS_AT_NOT_FUTURE'>>
```
In one transaction, with `const at = now()`, checked in this order:
1. `appointments.findById`. Missing → `APPOINTMENT_NOT_FOUND`.
2. Status `cancelled` → `APPOINTMENT_CANCELLED`. Current `startsAt <= at` → `APPOINTMENT_STARTED`. New `startsAt <= at` → `STARTS_AT_NOT_FUTURE`.
3. Same instant as the current `startsAt` (compare `getTime()`) → return the appointment unchanged (rule 1: no second reminder for the same time).
4. `reminders.cancelPending`; `appointments.update({ id, startsAt, status: 'scheduled' })`; `clinics.findById` for the timezone; `planReminder`; `reminders.create`. The new reminder is created even when the previous one was already sent.
5. Return `appointments.findById`.

Every repository call in these steps uses the repositories of the transaction.

### `cancelAppointment` — deps `{ transaction }`

```ts
(input: { id: AppointmentId }) => Promise<Result<Appointment, 'APPOINTMENT_NOT_FOUND'>>
```
In one transaction: `appointments.findById`; missing → error; already cancelled → return it unchanged; otherwise `reminders.cancelPending`, `appointments.update({ id, status: 'cancelled' })`, return the fresh appointment.

### `runReminderPass` — deps `{ reminders, provider }`

```ts
() => Promise<{ processed: number }>
```
No transaction and no lock. `reminders.findDue({ at: now() })`, then for each one, in order:

1. `decideSend({ startsAt, phone, acceptsReminders, at: now() })`. `skip` → `settle` as `skipped` with the reason, without calling the provider.
2. `provider.sendMessage({ to: decision.to, text: reminderText(...), idempotencyKey: reminder.id })`.
3. `afterAttempt({ outcome, attempt: reminder.attempts + 1, attemptedAt: now() })` → `settle`.

`processed` is the number of reminders in the list.

What holds and what does not:

- **One message per reminder, always.** Two concurrent passes may both call the provider for the same reminder, but with the same `Idempotency-Key`; the provider delivers once and both passes settle it as `sent`.
- A reminder that fails stays `pending` with a later `next_attempt_at`; a later pass picks it up. A retry is never a wait inside the pass.
- `decideSend` runs before every attempt, so retries are also dropped as `too_late`.
- If the process dies after the provider accepted, the reminder is still `pending`; the next pass resends with the same key and the provider deduplicates.
- **Accepted trade-off:** with simultaneous passes, `processed` and `attempts` can count the same reminder twice. Avoiding it needs a row lock held during the provider call; it was left out to keep the code simple. `settle` only writes when the reminder is still `pending`, so a slower pass never overwrites a final state.
- Reschedule, cancel and the webhook use a transaction only so their writes land together; the unique index on pending reminders is the guard against two live reminders for one appointment.

### `handleInboundMessage` — deps `{ transaction }`

```ts
(input: InboundMessage) => Promise<'applied' | 'duplicate' | 'ignored'>
```
In one transaction:
1. `inboundMessages.insertIfNew` (`ON CONFLICT DO NOTHING`). `false` → `duplicate`.
2. `parseReply(text)`. `null` → `ignored`.
3. `appointments.findLastRemindedByPhone({ phone: from, at: now() })`. None → `ignored`.
4. `confirm` → `update({ id, status: 'confirmed' })`. `cancel` → `reminders.cancelPending` and `update({ id, status: 'cancelled' })`. → `applied`.

The message is stored in the same transaction that applies it: if applying fails, the provider's retry is processed again. The lookup is by phone, not by patient, because the same number can belong to several patients. A cancelled appointment is excluded from the lookup, so a SI after a NO is ignored.

### Shape of a file

```ts
// app/create-appointment.ts
export type CreateAppointmentInput = Readonly<{ clinicId: ClinicId; patientId: PatientId; startsAt: Date }>;
export type CreateAppointmentError = 'CLINIC_NOT_FOUND' | 'PATIENT_NOT_FOUND' | 'PATIENT_NOT_IN_CLINIC' | 'STARTS_AT_NOT_FUTURE';
export type CreateAppointmentDeps = Readonly<{
  clinics: ClinicRepository;
  patients: PatientRepository;
  appointments: AppointmentRepository;
  quietHours: QuietHours;
}>;

export const makeCreateAppointment =
  (deps: CreateAppointmentDeps) =>
  async (input: CreateAppointmentInput): Promise<Result<Appointment, CreateAppointmentError>> => { /* … */ };
```

### Wiring (`infra/wiring/<feature>.ts`)

One file per feature: `clinics`, `patients`, `appointments`, `reminders`, `inbound-messages`.

```ts
// infra/wiring/appointments.ts
import { makeCreateAppointment } from '@/app/create-appointment';
import { makeRescheduleAppointment } from '@/app/reschedule-appointment';
import { repositories, transaction } from '@/infra/repositories';
import { config } from '@/infra/config';

export const createAppointment = makeCreateAppointment({
  clinics: repositories.clinics,
  patients: repositories.patients,
  appointments: repositories.appointments,
  quietHours: config.quietHours,
});
export const rescheduleAppointment = makeRescheduleAppointment({ transaction, quietHours: config.quietHours });
```

`infra/repositories/index.ts` exports `makeRepositories(db)` (accepts the client or a transaction client), `repositories = makeRepositories(prisma)` and `transaction`, which wraps `prisma.$transaction(tx => work(makeRepositories(tx)))`.

## 9. HTTP

A route does three things: parse the input with a Zod schema, call the use case, map the result.

- **Schemas** (`infra/http/schemas.ts`) return domain types, not raw strings:
  - dates: `z.iso.datetime({ offset: true })` → `Date` (a date without zone is 400);
  - `timezone`: must pass `IANAZone.isValidZone` → `Timezone` (400 otherwise);
  - `phone`: `^\+[1-9]\d{7,14}$` → `Phone`, or `null`; a missing `phone` is `null`;
  - `name`: at least one character.
- **Ids**, in the path or in the body: one that is not a UUID answers **404** with the same message as a missing entity, without calling the use case. A UUID becomes the branded id.
- **Errors**: always `{ "error": "<message>" }`. Invalid body or malformed JSON → 400. Unknown route → 404. Unhandled exception → 500.

| Use-case error | Status |
|---|---|
| `PATIENT_NOT_IN_CLINIC`, `STARTS_AT_NOT_FUTURE` | 400 |
| `CLINIC_NOT_FOUND`, `PATIENT_NOT_FOUND`, `APPOINTMENT_NOT_FOUND` | 404 |
| `APPOINTMENT_CANCELLED`, `APPOINTMENT_STARTED` | 409 |

| Endpoint | Use case | Success |
|---|---|---|
| `GET /health` | — (a query succeeds) | 200 |
| `POST /clinics` | `createClinic` | 201 |
| `POST /patients` | `createPatient` | 201 |
| `POST /appointments` | `createAppointment` | 201 |
| `GET /appointments/:id` | `getAppointment` | 200 |
| `PATCH /appointments/:id` | `rescheduleAppointment` | 200 |
| `POST /appointments/:id/cancel` | `cancelAppointment` | 200 |
| `POST /jobs/reminders/run` | `runReminderPass` | 200 `{ processed }` |
| `POST /webhooks/inbound-messages` | `handleInboundMessage` | 200 for all three results |
| `PUT /test/clock` | `setClock` | 204; the route is only registered with `CLOCK_MODE=test` |

## 10. Infrastructure

- **Config** (`infra/config.ts`, Zod, fails at startup when invalid; exports `config`, including `config.quietHours: QuietHours`): `DATABASE_URL`, `PROVIDER_URL`, `PORT` (3000), `CLOCK_MODE` (`test` or unset), `QUIET_HOURS_FROM` (21), `QUIET_HOURS_UNTIL` (9).
- **Clock**: `let fixed: Date | null = null; export const now = () => fixed ?? new Date(); export const setClock = (d: Date) => { fixed = d; };`
- **Startup**: the container runs `prisma migrate deploy` and then `tsx src/main.ts`. `/health` answers 200 only when a query succeeds.
- **Provider client**: `POST {PROVIDER_URL}/messages` with `{ to, text }` and the `Idempotency-Key` header, aborted at 5 s. 200 or 202 → `delivered`; 400 or 422 → `rejected`; 503 → `not_delivered`; 504, any other status, a network error or the timeout → `unknown`. It never throws. The file exports `provider: ProviderClient`.
- **Compose**: `api` (3000, `CLOCK_MODE=test`, `PROVIDER_URL=http://provider:4010`) and `db` are added; the `provider` service is not modified. `api` waits for `db` with `depends_on: condition: service_healthy` (`pg_isready`). `prisma generate` runs in the Dockerfile and in CI before the typecheck.

## 11. Tests

| Level | Where | What |
|---|---|---|
| Unit | `src/app/*.test.ts` | Use cases that only compute, table-driven, no mocks |
| API | `tests/api/*.test.ts` | End to end over HTTP against the full compose stack: only public endpoints, `PUT /test/clock` and the provider's `/admin/*` |
| Provider client | `tests/api/provider-client.test.ts` | `sendMessage` directly against the provider container, driven by `/admin/rules` |

`npm run check` = lint + typecheck + unit. `npm run test:api` builds and starts the stack under a compose project and host ports derived from the worktree, so parallel worktrees do not collide, and tears it down afterwards. Rules for API tests, because the stack is shared state:

- Test files run one at a time (`fileParallelism: false`): the clock is global to the service.
- Every test creates its own clinic and patient with a phone no other test uses. Provider rules and messages are per phone.
- Reminders left by earlier tests may be processed by a later pass. Assert the state of the test's own appointments and the messages sent to its own phone; for `processed`, assert a lower bound.
- The provider simulator cannot be slow or unreachable, so the 5 s timeout and the network error are implemented but not tested. The `unknown` outcome is tested through the 504 of `lost-response`.
- Parallel worktrees: `test:api` uses a test-only compose override that remaps the published ports (`ports: !override`), since the provider's `4010:4010` cannot be edited.

Tests are written by the `test-writer` agent from signatures and rules, never from the implementation; expected values come from the statement.

## 12. Implementation plan

One task is one functionality. Waves run in order; tasks inside a wave run in parallel.

| Wave | Tasks |
|---|---|
| 0 | T0 Repo base |
| 1 | T1 Clinics and patients · T2 Reminder rules · T3 Provider client |
| 2 | T4 Appointments |
| 3 | T5 Send pass · T6 Patient replies |
| 4 | T7 README |

In wave 3, T6 does not depend on T5's code but its tests need a sent reminder: T6 is implemented in parallel and, once T5 is merged, merges `main` and runs its tests before review.

### T0. Repo base

**Scope.** Everything shared, so later tasks do not edit the same files.
- `package.json`, strict TypeScript, `@/` alias, ESLint (relative imports forbidden), Vitest, scripts `check` and `test:api`.
- Harness: `AGENTS.md`, `CLAUDE.md`, the `test-writer` agent and the `implementation` and `implement-task` skills are already in the repo. Commit the rest of `.claude/` and `.agents/` as they are.
- `Dockerfile`, `api` and `db` services, `schema.prisma` and the single migration of section 4, migrations at startup, `GET /health`.
- GitHub CI on every push to `main`: `npm run check` and `npm run test:api`.
- `infra/config.ts`, `infra/clock.ts`, `infra/db.ts`, `PUT /test/clock`.
- `shared/result.ts`, every file of `domain/` exactly as in section 5, and `app/ports.ts` exactly as in section 6.
- `infra/repositories/index.ts` with `makeRepositories`, `repositories` and `transaction`; one file per repository whose methods throw `not implemented`.
- Express app with JSON parsing, `infra/http/schemas.ts` (all schemas of section 9, including id parsing), error format, 404, error mapping of section 9.
- Every route of `openapi.yaml` registered in its resource file, answering 501.
- `infra/wiring/` with one empty file per feature.
- `tests/helpers/`: HTTP client, set clock, provider reset, create clinic, patient and appointment. Smoke test for `/health` and `/test/clock`.

**Out of scope.** Any logic: use cases, repository bodies, provider client.

**Acceptance.**
1. `docker compose up --build` from scratch leaves `GET /health` at 200.
2. With the database down, `GET /health` is not 200.
3. `PUT /test/clock` answers 204 with `CLOCK_MODE=test` and does not exist without it.
4. Every other route of the contract answers 501; an unknown route, 404 with `{ "error": … }`.
5. `npm run check` and `npm run test:api` pass; CI is green after the push.

### T1. Clinics and patients

**Scope.** `POST /clinics`, `POST /patients`; `createClinic`, `createPatient`; clinic and patient repositories.
**Owns.** `app/create-clinic.ts`, `app/create-patient.ts`, `infra/repositories/{clinics,patients}.ts`, `infra/wiring/{clinics,patients}.ts`, `infra/http/routes/{clinics,patients}.ts`.

**Acceptance.**
1. A clinic with a name and a valid IANA zone → 201 with its `id`. A zone that does not exist → 400.
2. A patient in an existing clinic → 201; unknown clinic → 404.
3. A phone that is not E.164 → 400; `null` or absent is valid.
4. Incomplete or mistyped bodies → 400 with `{ "error": … }`.

**Tests.** API. **Depends on** T0.

### T2. Reminder rules

**Scope.** The five use cases that only compute, section 7: `planReminder`, `decideSend`, `reminderText`, `afterAttempt`, `parseReply`.
**Owns.** `app/{plan-reminder,decide-send,reminder-text,after-attempt,parse-reply}.ts`. Nothing reachable through the API, so the reviewer does not run `/verify`.

**Acceptance.**
1. `planReminder`: same local time on the previous day in the clinic zone; the statement's March and October DST cases and the Canary case give the expected instant.
2. A time inside quiet hours moves to their end; `from` o'clock is quiet, `until` o'clock is not.
3. A computed time already in the past becomes `notBefore`, and quiet hours apply again.
4. Not before the appointment → `skipReason: 'too_late'`.
5. `decideSend`: `too_late`, `no_phone`, `opted_out`, checked in that order.
6. `reminderText`: the exact text of the statement, date and time in the clinic zone.
7. `afterAttempt`: delivered → `sent`; rejected → `failed`; not delivered or unknown → +1 min, then +5 min, then `failed`.
8. `parseReply`: SI and NO regardless of case, accents and surrounding punctuation; anything else is `null`.

**Tests.** Unit. **Depends on** T0.

### T3. Provider client

**Scope.** `sendMessage` as specified in section 10.
**Owns.** `infra/provider/client.ts`.

**Acceptance.**
1. Sends `POST /messages` with the phone, the text and the given `Idempotency-Key`.
2. 200 or 202 → `delivered`; 422 → `rejected`; 503 → `not_delivered`; 504, network error or more than 5 s → `unknown`.
3. Two sends with the same key deliver one message.

**Tests.** Provider client level, for what the simulator can produce: 200, 202, 422, 503 and 504. **Depends on** T0.

### T4. Appointments

**Scope.** `POST /appointments`, `GET /appointments/:id`, `PATCH /appointments/:id`, `POST /appointments/:id/cancel`; the four use cases; appointment repository (`create`, `findById`, `update`) and reminder repository (`create`, `cancelPending`).
**Out of scope.** Sending; the webhook; `findDue`, `settle`, `findLastRemindedByPhone`.
**Owns.** `app/{create,get,reschedule,cancel}-appointment.ts`, `infra/repositories/{appointments,reminders}.ts`, `infra/wiring/appointments.ts`, `infra/http/routes/appointments.ts`.

**Acceptance.**
1. Creating → 201 with one `pending` reminder whose `scheduledFor` follows rules 2 to 4.
2. When the reminder does not fit before the appointment it is born `skipped` with `too_late`.
3. Unknown clinic or patient → 404. Patient of another clinic or non-future time → 400.
4. Reading returns the reminders oldest to newest; unknown id → 404.
5. Rescheduling cancels the pending reminder and creates a new one, also when the previous one was already sent.
6. Rescheduling a `confirmed` appointment returns it to `scheduled`.
7. Rescheduling a cancelled appointment → 409. Rescheduling one that already started → 409. A new time that is not future → 400.
8. Cancelling leaves the appointment and its pending reminder `cancelled`; repeating it → 200 with no change.
9. Dates in responses are UTC with `Z`.
10. An unknown id, or one that is not a UUID, → 404 on read, reschedule and cancel.

**Tests.** API. **Depends on** T1, T2.

### T5. Send pass

**Scope.** `POST /jobs/reminders/run`, `runReminderPass`, `findDue`, `settle`.
**Owns.** `app/run-reminder-pass.ts`, `infra/wiring/reminders.ts`, `infra/http/routes/jobs.ts`; in `infra/repositories/reminders.ts` only the two methods above.

**Acceptance.**
1. A due reminder is sent once, with the exact text, and becomes `sent` with `sentAt`. One not yet due is untouched.
2. The response reports how many reminders were processed.
3. No phone or not accepting reminders → `skipped` with `no_phone` or `opted_out`, without calling the provider.
4. Appointment already started when sending or retrying → `skipped` with `too_late`.
5. Provider unavailable → retry at +1 min and +5 min; third failure → `failed`. Retries do not wait for quiet hours.
6. Lost response or more than 5 s → retry with the same `Idempotency-Key`; the patient gets one message.
7. Provider rejection (422) → `failed` with no retry.
8. Several concurrent passes deliver one message per reminder (checked with `/admin/messages`).
9. A cancelled or rescheduled appointment does not send its previous reminder.

**Tests.** API, with the provider's `/admin/rules`. **Depends on** T3, T4.

### T6. Patient replies

**Scope.** `POST /webhooks/inbound-messages`, `handleInboundMessage`, `insertIfNew`, `findLastRemindedByPhone`.
**Owns.** `app/handle-inbound-message.ts`, `infra/repositories/inbound-messages.ts`, `infra/wiring/inbound-messages.ts`, `infra/http/routes/webhooks.ts`; in `infra/repositories/appointments.ts` only `findLastRemindedByPhone`.

**Acceptance.**
1. SI confirms the appointment of the last reminder sent to that phone.
2. NO cancels that appointment and its pending reminder.
3. Variants (`Sí`, `SI!`, `no.`) are recognised; other text is ignored with 200.
4. The same `messageId` twice is applied once.
5. Among several appointments of the same phone, the one whose reminder was sent most recently wins, also when it was created earlier than the others; started and cancelled appointments are excluded.
6. A phone with no applicable appointment → 200 and nothing changes.
7. A body that breaks the schema → 400.
8. A SI after a NO is ignored: the appointment stays cancelled.

**Tests.** API. **Depends on** T4 to implement; T5 merged to run its tests.

### T7. README

Written last, on `main`, without a worktree, in Spanish: how to run and test, decisions, what was left out, production note (500 clinics, about 20 000 reminders a day, real WhatsApp, deployment, monitoring), and a concise section on how AI was used.

### Done

The last commit on `main` has CI green and `tests/api` passes from a clean clone.
