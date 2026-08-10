# ADR-001: Modular Monolith

- **Status:** Accepted (2026-08-10)
- **Context:** MVP1 adds merchant tenancy, conversational commerce, AI tools, channels, and demand analytics to an existing NestJS/Prisma modular monolith. The master prompt permits "NestJS or equivalent modular TypeScript service" and prohibits speculative microservices.
- **Decision:** Keep one NestJS application and one PostgreSQL database. Add bounded modules (`merchant`, `commerce`, `conversations`, `ai`, `channels`, `demand`) with explicit dependency direction and one-writer-per-artifact control.
- **Alternatives:** Microservices (rejected: no scale/team requirement; increases contract, deploy, and context cost); separate AI service (rejected: adds network hops without a measured requirement).
- **Rationale:** Existing shop/auth/RBAC/audit reuse, single transaction scope for orders, fastest safe delivery, simplest rollback.
- **Consequences:** Modules must respect dependency direction; schema changes are serialized; future extraction points are the module interfaces.
- **Risks:** Monolith growth; mitigated by bounded modules and enforced dependency direction.
- **Migration/rollback:** No infra change; new modules can be disabled by removing their registration.

# ADR-002: Channel Normalization

- **Status:** Accepted (2026-08-10)
- **Context:** Instagram/WhatsApp/Telegram/Web must share one commerce logic; provider payloads differ; duplicate deliveries and webhook verification are required.
- **Decision:** Every adapter verifies and normalizes inbound payloads into one `NormalizedInboundMessage` contract, then calls the same conversation orchestrator. Outbound responses use an internal `CommerceResponse` union rendered by channel formatters. Raw provider payloads are not persisted by default.
- **Alternatives:** Per-channel business logic (rejected: duplicates AC-08 and diverges behavior); single chat SDK abstraction (rejected: weakest common denominator).
- **Rationale:** AC-08/09; testability (web harness = same pipeline); replay safety in dev/test.
- **Consequences:** Adapters are thin; orchestrator owns state; channel failures are observable and retryable.
- **Risks:** Provider API drift; contained inside adapter + contract tests.

# ADR-003: Commerce Source of Truth

- **Status:** Accepted (2026-08-10)
- **Context:** The model must never invent SKU, price, stock, size availability, shipping, discount, or return policy.
- **Decision:** All commercial facts come from the existing shop domain (PostgreSQL through Prisma) via an approved tool facade (`src/commerce/`). Every tool has strict input/output schema, merchant scoping, timeout/retry policy, audit, and deterministic error codes. The LLM receives tool results, never raw DB access.
- **Alternatives:** Letting the model answer from memory (rejected: AC-01/14); direct Prisma in prompts (rejected: arbitrary SQL risk).
- **Rationale:** AC-01/05/06/14; trust contract.
- **Consequences:** Commerce tool schemas are frozen contracts; new facts require a new approved tool.
- **Risks:** Stale reads; mitigated by tool-call-time reads and stale-data tests.

# ADR-004: Demand Signal Privacy

- **Status:** Accepted (2026-08-10)
- **Context:** Shared analytics must never expose customer identity or raw conversation text; future multi-store Demand Network depends on trust.
- **Decision:** DemandEvent stores only normalized, merchant-scoped attributes (category, canonical attributes, size, budget band, currency, intent, confidence, outcome, region when approved) with `privacyVersion`. Aggregation uses deterministic SQL with minimum thresholds before small-cell display. Raw payloads not persisted; retention config-driven; human/legal decision required before production.
- **Alternatives:** Storing raw text + identity and aggregating later (rejected: privacy posture, AC-13).
- **Rationale:** AC-10/11/13; data minimization.
- **Consequences:** Demand pipeline is separate from conversation storage; attribute extraction by LLM is validated against controlled vocabulary.
- **Risks:** Legal/retention requirements; tracked as production blocker until human decision.

# ADR-005: LLM Tool Boundary

- **Status:** Accepted (2026-08-10)
- **Context:** LLM behavior must be tool-first, evidence-first, and incapable of unsafe actions.
- **Decision:** A provider-neutral internal gateway (`src/ai/`) exposes a fixed allow-list of commerce tools. The agent policy: structured validated intent, strict tool schemas, response validator that rejects fabricated facts, language/RTL rules, human-handoff criteria, structured outcome emission, and stop/escalate instructions. The model can never execute arbitrary SQL/HTTP/shell/payment actions. Deterministic fake provider powers tests; real provider selected only after credential + terms review (TD-01).
- **Alternatives:** Direct provider SDK everywhere (rejected: lock-in, no testable boundary); unrestricted function calling (rejected: safety).
- **Rationale:** AC-07/13/14; reproducibility; provider migration.
- **Consequences:** Every new tool is a contract change; evaluation suite gates model behavior.
- **Risks:** Model non-compliance; mitigated by validator + fake-provider eval + handoff policy.
