# QA.md — Independent QA Policy (MVP1)

**Version:** v1 — QA Authority: QA Agent (DeepSeek Pro 4); verdict gates owned by ORC.

## 1. Independence

- QA executes validation commands itself against the exact revision under review.
- QA never approves from implementer reports alone; evidence read-backs are required.
- QA may not implement production fixes, redefine requirements, contracts, or architecture, or silently expand scope.

## 2. Verdicts

```text
PASS
PASS WITH DOCUMENTED RISK   (must name risk + owner + mitigation)
FAIL                        (must name failed criterion + evidence + smallest correction task)
BLOCKED                     (missing prerequisite, credentials, decision, or evidence)
```

## 3. Standard evidence checklist per task

- git status/diff limited to declared write-set (no protected files touched).
- lint 0 warnings, typecheck clean, unit/integration/frontend/database suites with counts.
- Migration rehearsal on fresh DB + row-count/backfill checks where schema changed.
- Behavior read-backs: HTTP status codes, persisted rows, rendered UI (browser where relevant).
- Idempotency replay where the task touches messages/carts/orders/demand.
- Merchant isolation probes on every protected API introduced.
- Secret/PII inspection: no secrets in prompts/logs/evidence; shared output contains no identity.
- Regression: existing shop/auth/checkout suites still green.

## 4. Task loop

```text
Task contract + diff + tests + AC ids → QA executes → one verdict
PASS → ORC final gate → next task
FAIL → ORC creates exactly one correction task
Repeated failure of same defect (2 rounds) → root-cause reclassification / human decision
```

## 5. Evaluation set for LLM behavior (deterministic, fake provider)

Dimensions: tool selection, factual grounding, refusal/escalation, language quality (fa/en, RTL-safe), structured outcome emission.
Cases: Persian search; one useful clarification; exact/partial/no-match; out-of-stock; price-too-high; comparison + positional references; cart/checkout handoff; angry/refund/payment/handoff; duplicate webhook; malformed payload; unauthorized merchant; stale price/inventory; channel delivery failure + retry.

## 6. Final gate (Q22)

Runs `npm run lint && npm run typecheck && npm run test:unit && npm run test:frontend && npm run test:integration && npm run test:database && npm run build && npm run test:e2e` on the exact revision, plus fresh-DB migration, E2E web flow, Web/Telegram normalized equivalence, replay, cross-merchant denial, privacy/log inspection, dependency audit, protected-file inspection, rollback/runbook review. Verdict feeds ORC final approval.
