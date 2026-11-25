# Repository guidelines

Backend take-home for ClinicSay: an HTTP API in Node and TypeScript on PostgreSQL that schedules and sends appointment reminders through an external provider.

## Sources of truth

| File | Defines |
|---|---|
| `enunciado.pdf` | The business rules and how the work is evaluated |
| `openapi.yaml` | The HTTP contract |
| `docs/architecture.md` | How the service is built: folders, types, use cases, data model, tests, and the implementation plan |

Read `docs/architecture.md` completely before changing code. When it does not cover something or contradicts the statement, stop and ask.

Never edit `enunciado.pdf`, `openapi.yaml`, anything under `provider/`, or the `provider` service in `docker-compose.yml`.

## Structure

- `src/domain/`: types only, one file per entity. No functions.
- `src/app/`: all the logic, one use case per file.
- `src/infra/`: database, provider client, HTTP, configuration, clock, wiring.
- `tests/api/`: end-to-end tests over HTTP against the full `docker compose` stack.

## Rules

- Absolute imports only: `@/domain/...`, `@/app/...`, `@/infra/...`, `@/shared/...`. Never `./` or `../`.
- One named-object argument per use case and repository method: `getAppointment({ id })`.
- A use case that needs the database, the provider or the clock is a closure, `makeX(deps)`; one that only computes is a plain function.
- Expected failures are returned as `Result<T, E>`, not thrown.
- Never `new Date()` for the current time: `now()` from `@/infra/clock`.
- Branded types and discriminated unions as defined in the architecture document. No `any`, no `!`. `as` only in `src/infra/http/schemas.ts`, in repository row mappers and in tests.
- Never run `prisma migrate dev`: there is a single migration with hand-written indexes.

## Commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Starts the API on 3000, PostgreSQL and the provider on 4010 |
| `npm run check` | Lint, typecheck and unit tests |
| `npm run test:api` | Builds and starts the stack on ports of this worktree and runs `tests/api` |
| `npx vitest run <path>` | One test file |

## How work is done

- Implementing or changing code: follow the `implementation` skill. Small units, each validated, tested and committed.
- Tests are written by the `test-writer` agent, from the signature and the rules, never from the implementation. Do not write or edit tests yourself.
- Implementing the plan with several workers: the coordinator follows the `implement-task` skill.

## Commits

Concise imperative subject in English, no `feat:` or `fix:` prefixes. One commit per unit, with its tests. Committing does not authorize pushing. The remote for this work is `jorgeluis594`; never push to `origin`.
