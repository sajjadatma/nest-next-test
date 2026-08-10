# AGENTS.md — Agent Operating Rules (this repository)

**Version:** v1 — frozen by ORC (Sol Medium)

## For every agent working in this repository

1. **Read before you act.** Start from the plan/contract of your task: `.hermes/plans/*` and `tasks/*.yaml`. Read the referenced docs under `docs/`.
2. **Write only your write-set.** Anything else requires escalation to ORC. Protected files are listed in `docs/architecture/SYSTEM.md` §5.
3. **No guessing versions.** Versions are frozen in SYSTEM.md §1.
4. **Evidence before claims.** Report exact commands, exit codes, test counts, read-backs. Never fabricate results. A blocker is a valid outcome.
5. **Preserve existing behavior.** Existing shop/order/checkout/auth behavior and tests must keep passing. Do not refactor unrelated code.
6. **Language.** Implementation artifacts in English. Customer-facing copy supports Persian/RTL from day one.
7. **Golden Examples.** Follow the approved Golden Examples (SYSTEM.md §7) for new patterns; ask ORC before deviating.
8. **Escalate, don't improvise.** Changing contracts, schema scope, auth, privacy, dependencies, protected files, or product behavior → stop and report BLOCKED/ESCALATE with the smallest question.

## Task execution loop

```text
read contract → inspect repo → implement write-set → add required tests
→ run verification commands → report TASK_RESULT → QA verdict → ORC gate
```

## Result envelope (return exactly this)

```text
IMPLEMENTATION_COMPLETE
Changed files: ...
Tests run: ... (commands + exit codes + counts)
Evidence: ... (read-backs, HTTP statuses, DB checks)
Deviations: none | ...
Blocked questions: none | ...
```

## Repository commands (verified)

```bash
npm run db:up                 # start PostgreSQL (Docker, 127.0.0.1:5433)
npm run prisma:generate       # regenerate Prisma client
npm run prisma:migrate:deploy # apply migrations
npm run dev:check             # full preflight without starting servers
npm run dev                   # API :5050 + dashboard :3000
npm run lint / typecheck / test:unit / test:frontend / test:integration
npm run test:database         # testcontainers PostgreSQL
npm run build / npm run test:e2e
```

Known environment recovery: if `dashboard/.next/types` contains duplicate `*.d.ts` (TS6200/TS2300), remove `dashboard/.next` and restart.
