# Code smells

Read the diff of the unit against this list before committing. Fix every match in the code you wrote; do not commit it and do not leave it for later. Tests are not yours to edit: a smell in a test file goes to `test-writer`.

## 1. Ternaries

Use `if` with an early return. Never nest ternaries.

```ts
// Don't
return at < start ? { status: 'pending', scheduledFor } : { status: 'skipped', scheduledFor, skipReason: 'too_late' };

// Do
if (at < start) return { status: 'pending', scheduledFor };
return { status: 'skipped', scheduledFor, skipReason: 'too_late' };
```

## 2. `if / else` where a guard clause fits

Handle the exceptional case first and return. The main path stays unindented, with no `else`.

```ts
// Don't
if (appointment) {
  if (appointment.status !== 'cancelled') {
    return ok(await reschedule(appointment));
  } else {
    return fail('APPOINTMENT_CANCELLED');
  }
} else {
  return fail('APPOINTMENT_NOT_FOUND');
}

// Do
if (!appointment) return fail('APPOINTMENT_NOT_FOUND');
if (appointment.status === 'cancelled') return fail('APPOINTMENT_CANCELLED');
return ok(await reschedule(appointment));
```

## 3. `let` reassigned through branches

Compute the value in a small function that returns it.

```ts
// Don't
let delayMinutes;
if (attempt === 1) delayMinutes = 1;
else if (attempt === 2) delayMinutes = 5;

// Do
function retryDelayMinutes(attempt: number): number | null {
  if (attempt === 1) return 1;
  if (attempt === 2) return 5;
  return null;
}
```

## 4. Magic values

Name the numbers and strings that carry a rule.

```ts
// Don't
setTimeout(() => controller.abort(), 5000);

// Do
const PROVIDER_TIMEOUT_MS = 5_000;
setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
```

## 5. Comments that repeat the code

Keep a comment only when it says why, or cites the rule of the statement.

```ts
// Don't
// increment attempts
const attempt = reminder.attempts + 1;

// Do
const attempt = reminder.attempts + 1;
```

## 6. Vague names

`data`, `result`, `info`, `item`, `temp`, `handle`, `process`, `utils`, `helper`. Name the thing by what it is in the domain.

```ts
// Don't
const data = await deps.reminders.findDue({ at });
for (const item of data) { /* … */ }

// Do
const dueReminders = await deps.reminders.findDue({ at });
for (const reminder of dueReminders) { /* … */ }
```

## 7. Checks for cases the types already rule out

Do not defend against what cannot happen. The schema and the types did that work.

```ts
// Don't
if (!input || typeof input.name !== 'string') throw new Error('invalid input');
if (decision.action === 'send' && decision.to == null) return;

// Do: nothing. `input` is typed, and `decision.to` is a `Phone` whenever the action is `send`.
```

## 8. Swallowed errors

Catch only where the failure has a defined meaning. Everything else propagates to the HTTP error handler.

```ts
// Don't
try {
  return await deps.appointments.findById({ id });
} catch {
  return null;
}

// Do
return deps.appointments.findById({ id });
```

The provider client is the one place that catches: a network error is the outcome `unknown`.

## 9. Abstractions with one use

No wrapper that only forwards, no helper called once that is no clearer than its body, no option or parameter nobody passes, no class where a function does.

```ts
// Don't
const getNow = () => now();
function buildReminderPlanFromInput(input: PlanReminderInput) { return planReminder(input); }

// Do: call `now()` and `planReminder(input)` directly.
```

## 10. Leftovers

Commented-out code, `console.log`, unused imports, variables, parameters and exports, `TODO` without an owner. Delete them.

## 11. Escapes from the type system

`any`, non-null `!`, `@ts-ignore`, `as` outside the places `AGENTS.md` allows. Fix the type instead.

```ts
// Don't
const clinic = (await deps.clinics.findById({ id }))!;

// Do
const clinic = await deps.clinics.findById({ id });
if (!clinic) return fail('CLINIC_NOT_FOUND');
```

## 12. One function doing two things

A function that decides and also writes, or a route that holds a rule. Routes parse, call the use case and map the result; rules live in `src/app/`.

```ts
// Don't (in a route)
if (new Date(body.startsAt) <= now()) return res.status(400).json({ error: 'startsAt must be in the future' });

// Do: the use case returns 'STARTS_AT_NOT_FUTURE' and the route maps it.
```
