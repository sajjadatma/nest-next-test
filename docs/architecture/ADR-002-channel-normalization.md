# ADR-002: Channel Normalization

- **Status:** Accepted (2026-08-10)
- **Context:** Instagram/WhatsApp/Telegram/Web must share one commerce logic; provider payloads differ; duplicate deliveries and webhook verification are required.
- **Decision:** Every adapter verifies and normalizes inbound payloads into one `NormalizedInboundMessage` contract, then calls the same conversation orchestrator. Outbound responses use an internal `CommerceResponse` union rendered by channel formatters. Raw provider payloads are not persisted by default.
- **Alternatives:** Per-channel business logic (rejected: duplicates AC-08 and diverges behavior); single chat SDK abstraction (rejected: weakest common denominator).
- **Rationale:** AC-08/09; testability (web harness = same pipeline); replay safety in dev/test.
- **Consequences:** Adapters are thin; orchestrator owns state; channel failures are observable and retryable.
- **Risks:** Provider API drift; contained inside adapter + contract tests.
