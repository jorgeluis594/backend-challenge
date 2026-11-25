---
name: implement-task
description: Coordinates the implementation of the tasks in the implementation plan with Orca workers - one implementer and one reviewer per task, each task in its own worktree, merged into main by the coordinator. Use when asked to implement the plan, a wave or a task with Orca. Do not use for a small fix one agent can do directly (use Implementation).
---

# Implement task

The agent running this skill is the **coordinator**: it writes the specs, starts the workers, validates what they report, merges and pushes. It does not write application code or tests itself; code and every fix go to workers.

## References

| File | What it contains | When to read it |
| --- | --- | --- |
| [worker-briefs.md](worker-briefs.md) | Spec templates for implementer, reviewer and fix round | Before writing the first spec |
| `orca skills get orchestration` and `orca skills get orca-cli` | Version-matched commands and the rules of the coordinator loop | Before the first `orca` command; its commands win over any written here |
| `docs/architecture.md` | The design and, in its implementation plan, the tasks with their waves | Before choosing what to start |

## Steps

1. **Read the plan.** From the implementation plan in `docs/architecture.md`, take the tasks of the next wave: the ones whose dependencies are already merged into `main`. Tasks of one wave run at once; a task never starts before its dependencies are merged.

2. **Run each task of the wave** through the [Task cycle](#task-cycle).

3. **Close the wave.** When every task of the wave is merged, run `npm run check` and `npm run test:api` on `main` and push with `git push jorgeluis594 main`. Never push to `origin`: it is the company's repo. The push runs the CI on GitHub (`gh run watch`; in this shell call `gh` as `DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" gh …`, or it hangs); a red run goes to a worker and is fixed before the next wave starts.

## Task cycle

1. **Spec.** Write the implementer spec to a file in the scratchpad from [worker-briefs.md](worker-briefs.md): the common block, the task with its scope, out of scope, acceptance criteria and the sections of `docs/architecture.md` it implements, what is already merged, and the sibling tasks running in parallel with the files they own.

2. **Implementer.** Start it in a new child worktree based on `main`, with `--agent claude --model claude-opus-5-5`. It follows the Implementation skill: small units, each validated, tested by the `test-writer` agent and committed. Answer its questions from the statement (`enunciado.pdf`, `openapi.yaml`) and `docs/architecture.md`; when they allow two readings, ask the user.

3. **Validate the report.** The report matches the task's scope, lists the commits and every check with its result, and says how each suspected bug from `test-writer` was resolved. A change outside the scope, a check not run or a skipped test goes back to the same worker.

4. **Reviewer.** Start a fresh worker in the same worktree with the reviewer spec and `--agent claude --model claude-opus-5-5`. It does not edit or commit. It:
   - runs Claude Code's `/code-review` at level `high` on `git diff main...HEAD` and keeps only the findings that hold against the code;
   - runs Claude Code's `/verify` when the task implements functionality reachable through the API: it starts the stack and exercises each acceptance criterion against the running app and the provider;
   - runs `npm run check` and `npm run test:api`;
   - checks the change against the task (scope and every acceptance criterion), against `docs/architecture.md`, and that every test file was written by `test-writer` runs and not adjusted to the code.

   It reports **APPROVED** when there are no blockers, otherwise **REJECTED** with numbered findings.

5. **Fix round.** On a rejection, send the numbered blockers to the same implementer, then start a fresh reviewer. Repeat until approved. After three rejected rounds, or when a worker repeats the same attempt twice, report to the user.

6. **Merge.** On approval, merge the task's branch into `main` (conflicts that touch logic go to a worker), run `npm run check` and `npm run test:api` on `main`, and remove the task's worktree. If the worktree has uncommitted work, stop and report instead of forcing.

## A task whose tests need a sibling

T6 (patient replies) runs in parallel with T5 (send pass), but its tests need a sent reminder. Start both together. T6's implementer writes its code and stops before the API tests; when T5 is merged, tell it to run `git merge main`, have `test-writer` write and run the tests, and report. Only then start T6's reviewer.

## Guardrails

- Workers do not merge, rebase, push, use `git stash` or open PRs, and they touch only their task's scope. The coordinator merges and pushes.
- A finding is a **blocker** when it breaks an acceptance criterion or a rule of the statement, leaves a failure case unhandled, contradicts `docs/architecture.md`, or leaves a check red or a test skipped. Everything else is a suggestion and does not reject.
- The coordinator never reports a check or a verification as "not run": it sends it to a worker.
- Never poll for workers; end the turn and let Orca wake you.
