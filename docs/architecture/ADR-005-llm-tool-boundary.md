# ADR-005: LLM Tool Boundary

- **Status:** Accepted (2026-08-10)
- **Context:** LLM behavior must be tool-first, evidence-first, and incapable of unsafe actions.
- **Decision:** A provider-neutral internal gateway (`src/ai/`) exposes a fixed allow-list of commerce tools. The agent policy: structured validated intent, strict tool schemas, response validator that rejects fabricated facts, language/RTL rules, human-handoff criteria, structured outcome emission, and stop/escalate instructions. The model can never execute arbitrary SQL/HTTP/shell/payment actions. Deterministic fake provider powers tests; real provider selected only after credential + terms review (TD-01).
- **Alternatives:** Direct provider SDK everywhere (rejected: lock-in, no testable boundary); unrestricted function calling (rejected: safety).
- **Rationale:** AC-07/13/14; reproducibility; provider migration.
- **Consequences:** Every new tool is a contract change; evaluation suite gates model behavior.
- **Risks:** Model non-compliance; mitigated by validator + fake-provider eval + handoff policy.
