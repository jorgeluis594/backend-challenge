# Worker briefs

Each spec is self-contained: the worker has no conversation history. Replace `<...>`. Write the spec to a file and pass it as a file, never inline. Keep the common block identical across the workers of a run.

## Common block (prepend to every spec)

```text
CONTEXT: backend take-home for ClinicSay: an HTTP API in Node and TypeScript on PostgreSQL that schedules and sends appointment reminders through an external provider. Read AGENTS.md and follow it. The statement (enunciado.pdf) and openapi.yaml define what the system does; docs/architecture.md defines how it is built and holds the implementation plan. All three are normative.
CONSTRAINTS: Work only in your worktree and branch. Do only your task; sibling tasks run in parallel on other branches, so keep edits to shared files minimal and say which ones you touched. Do not merge, rebase, push, use git stash or open PRs. Do not edit AGENTS.md, skills, agents, docs/architecture.md, openapi.yaml, enunciado.pdf, the provider service of docker-compose.yml or anything under provider/. Only the files your task owns.
QUESTIONS: If the statement or the design is ambiguous or wrong, or you are blocked after two attempts, ask the coordinator with the `ask` command of your preamble instead of guessing.
CHECKS: `npm run check` (lint, typecheck, unit tests) and `npm run test:api` (end-to-end tests over HTTP against the full `docker compose` stack: API, Postgres and the provider, on containers and ports of this worktree only). If the environment fails (Docker, database, provider), report it with `ask`; a check that did not run does not count as passed.
```

## Implementer

```text
TASK: T<N> "<title>" of the implementation plan in docs/architecture.md. Read its Scope, Out of scope, Acceptance criteria and the design sections it references, and implement exactly that.
ALREADY MERGED IN YOUR BASE: <tasks and commits, or "nothing">.
RUNNING IN PARALLEL: <sibling tasks and the files they own>.
METHOD: follow the Implementation skill (.claude/skills/implementation/SKILL.md): small logical units, each one validated, tested by the test-writer agent and committed before the next. Do not write or edit tests yourself.
ACCEPTANCE: `npm run check` and `npm run test:api` pass with no skipped test, and every acceptance criterion of the task is covered by a test.
REPORT (worker_done): branch, commits, each check command with its result, each suspected bug reported by test-writer with how it was resolved (code fixed, test rewritten by a fresh test-writer, or asked), deviations from the design with the reason, known debt.
```

## Reviewer

```text
REVIEW-ONLY TASK for T<N> in this worktree (branch <branch>). Validate; do not edit, commit or fix.
1. Run Claude Code's /code-review at level high on `git diff main...HEAD`. Verify each finding against the code and drop the ones that do not hold.
2. <If the task implements functionality reachable through the API:> Run Claude Code's /verify: start the stack with `docker compose up --build`, and exercise every acceptance criterion of T<N> against the running API and the provider (its /admin endpoints show what was sent). Set the time with PUT /test/clock. Stop the stack when done.
3. Run `npm run check` and `npm run test:api` yourself.
4. Check the change against T<N> in docs/architecture.md: it does what the task asks and nothing outside it; every acceptance criterion is met; the layers, signatures, data model and transactions follow the document; expected values in the tests come from the statement, and no test was weakened, skipped or adjusted to the code (`git log -p -- '*.test.ts'`).
5. Read the whole diff, tests included, against .claude/skills/implementation/code-smells.md. This code will be read by people: every match is a blocker, reported with file:line and the number of the smell.
COORDINATOR NOTES — deviations declared by the implementer: <list>.
A finding is a blocker when it breaks an acceptance criterion or a rule of the statement, leaves a failure case unhandled, contradicts docs/architecture.md, matches a smell of code-smells.md, or leaves a check red or a test skipped. Everything else is a suggestion.
REPORT (worker_done): verdict APPROVED (no blockers) or REJECTED; numbered findings with file:line, blocker or suggestion, what is wrong and why it matters; for /verify, each acceptance criterion with what you sent and what you observed; each check command with its result. --outcome succeeded on APPROVED, --outcome failed on REJECTED.
```

## Fix round

```text
ROUND <K> for T<N>. Apply only these blockers from the review, verifying each against the current code first: <numbered list with file:line>. Do exactly this and nothing more; if a finding does not hold against the code, say why. A blocker about a test goes to a fresh test-writer, never to a manual edit.
<If the base moved:> First run `git merge main`.
Then rerun `npm run check` and `npm run test:api`. REPORT as in the implementer task, per finding: fixed or why not.
```
