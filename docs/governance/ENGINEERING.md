# ENGINEERING.md — Engineering Policies (MVP1)

**Version:** v1 — frozen by ORC (Sol Medium), 2026-08-10
**Baseline:** Universal Programming Project Baseline (`software-factory-governance/references/programming-project-baseline.md`) applies. Project-local rules below strengthen it.

## 1. Team and authority

| Role | Model/profile | Owns | Final on |
|---|---|---|---|
| Product Agent | Sol Medium (gpt-5.6-sol) | Behavior, scope, ACs, metrics, decisions | Product acceptance |
| ORC Agent | Sol Medium | Architecture, contracts, task graph, write-sets, sequence, approval | Technical completion |
| Backend Agent | GLM 5.2 / heavy impl: gpt-5.6-terra | Backend implementation in approved write-set | Implementation evidence |
| Frontend Agent | GLM 5.2 | Frontend implementation in approved write-set | Implementation evidence |
| QA Agent | DeepSeek Pro 4 | Independent evidence + verdict | QA verdict |

- Only ORC declares a task complete/mergeable/done.
- Implementation agents never redefine contracts, architecture, scope, or product behavior; escalate instead.
- One writer per artifact; schema migrations serialized; WIP limit one implementation task per specialist unless ORC approves two.

## 2. Task contract (mandatory fields)

`id, title, goal, why, preconditions, inputs, expected_output, read_set, write_set, protected_set, contracts, constraints, implementation_notes, acceptance_criteria, tests_required, verification_commands, definition_of_done, non_goals, stop_conditions, handoff_format`

Executor result envelope: `IMPLEMENTATION_COMPLETE / Changed files / Tests run / Evidence / Deviations / Blocked questions`. QA verdict: `PASS | PASS WITH DOCUMENTED RISK | FAIL | BLOCKED` (project-local: PASS WITH DOCUMENTED RISK is allowed and must name the risk + owner).

## 3. Escalation triggers

Stop and escalate to ORC (and human where required) when: public contract change needed; protected file touched; unapproved dependency; schema/migration scope change; auth/RBAC/privacy/payment behavior change; adjacent problem; product decision required; repeated failure of the same defect (max 2 repair rounds).

## 4. Evidence rules

- Evidence must be produced after the latest relevant change, on the exact revision under review.
- Required: exit codes, test counts, migration rehearsal, read-backs (HTTP status, DB rows, rendered UI).
- No PASS marker after a failed command; chain with `&&` or inspect every exit code.
- Never fabricate output; a blocker is a successful control outcome.

## 5. Schema and migration rules

- One migration per logical change; SQL is hand-reviewed; backfill included in the migration; NOT NULL constraints only after backfill.
- Fresh-database rehearsal + row-count checks before merge.
- Rollback notes required for every migration affecting existing data.
- Raw SQL in migrations; Prisma schema is the single source of truth for models.

## 6. Security rules

- Secrets never enter: task briefs, prompts, model context, logs, or evidence.
- Merchant scoping enforced at every repository/service boundary (not UI-only).
- Webhook verification before processing; checkout links signed + expiring; rate limits; redact PII in logs; fail closed.

## 7. Code review / QA

- QA inspects real diffs and executes validation commands itself.
- QA never approves from implementer reports alone and never expands scope silently.
- Golden Examples must be followed; deviations require ORC approval.
