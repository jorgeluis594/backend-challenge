---
name: implementation
description: Guides implementation in this repo through small logical units, each one validated, tested by the test-writer agent and committed before the next starts. Use for requests to implement, change, fix or refactor code.
---

# Implementation

## Steps

1. Read the request, `AGENTS.md`, and the parts of the statement that define the behavior: the rules in `enunciado.pdf` and the contract in `openapi.yaml`. They are the source of truth for what the system does; when the request and the statement disagree, stop and ask.
2. Read `docs/architecture.md` completely. It is the source of truth for how the system is built: layers, files, function signatures, data model, transactions. Implement what it defines; when the change needs something it does not cover or contradicts it, stop and ask instead of deciding on your own.
3. Read the code the change touches and its callers.
4. Inspect Git status and preserve unrelated changes.
5. Split the work into small logical units in dependency order, each independently understandable and validatable. Create only the files and layers the current behavior needs.
6. Take each unit through the [Unit cycle](#unit-cycle) before starting the next.
7. Before reporting completion, verify that every unit is committed and that the checks pass on the final state. Report the commit IDs, the checks run with their result, and anything left open.

## Unit cycle

Repeat for each logical unit:

1. **Implement** one coherent part of the requirements. Leave no intentionally incomplete or broken behavior.
2. **Validate** with `npm run check` (lint, typecheck and unit tests). Fix what the change broke.
3. **Test.** Start the `test-writer` agent (Agent tool, `subagent_type: test-writer`) when the unit adds or changes behavior the statement defines. Give it only the function name with its import path and signature (or the endpoint), the rules of the statement it covers, and the test file. Never paste code or describe how it is built. Do not write or edit tests yourself.
4. **Resolve its report.** For each failing test it reports as a suspected bug, read the rule in the statement:
   - The code is wrong: fix the code and run the test again.
   - The test is wrong: do not edit it. Start a fresh `test-writer` with the same input plus the rule it misread.
   - The statement allows both readings: stop and ask the user.
5. **Run everything**: `npm run check`, and `npm run test:api` when the unit touches an endpoint, a query or a migration. Every test passes; none is skipped.
6. **Commit** the unit with its tests in one commit. Inspect the diff for one clear purpose and stage only that unit. Concise imperative subject in English describing the behavior, without prefixes such as `feat:` or `fix:`.

A unit with no behavior of its own (project setup, Docker, configuration, CI) skips steps 3 and 4.

## Guardrails

- Commit after every unit. Never accumulate units into one final commit, and never start a unit while the previous one is uncommitted or red.
- A failing test is fixed in the code. Never change an expected value, skip a test or weaken an assertion to make it pass.
- If a check fails for a reason outside the change (Docker, database, provider), report it with its output instead of skipping it.
- The conventions of the code (layers, `Result<T, E>` for expected failures, the clock, dates in UTC) are in `docs/architecture.md`. Do not restate or reinterpret them here.
- Committing does not authorize pushing.
