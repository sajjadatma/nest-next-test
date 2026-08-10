# ADR-003: Commerce Source of Truth

- **Status:** Accepted (2026-08-10)
- **Context:** The model must never invent SKU, price, stock, size availability, shipping, discount, or return policy.
- **Decision:** All commercial facts come from the existing shop domain (PostgreSQL through Prisma) via an approved tool facade (`src/commerce/`). Every tool has strict input/output schema, merchant scoping, timeout/retry policy, audit, and deterministic error codes. The LLM receives tool results, never raw DB access.
- **Alternatives:** Letting the model answer from memory (rejected: AC-01/14); direct Prisma in prompts (rejected: arbitrary SQL risk).
- **Rationale:** AC-01/05/06/14; trust contract.
- **Consequences:** Commerce tool schemas are frozen contracts; new facts require a new approved tool.
- **Risks:** Stale reads; mitigated by tool-call-time reads and stale-data tests.
