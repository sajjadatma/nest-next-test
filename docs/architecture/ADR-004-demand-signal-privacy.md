# ADR-004: Demand Signal Privacy

- **Status:** Accepted (2026-08-10)
- **Context:** Shared analytics must never expose customer identity or raw conversation text; future multi-store Demand Network depends on trust.
- **Decision:** DemandEvent stores only normalized, merchant-scoped attributes (category, canonical attributes, size, budget band, currency, intent, confidence, outcome, region when approved) with `privacyVersion`. Aggregation uses deterministic SQL with minimum thresholds before small-cell display. Raw payloads not persisted; retention config-driven; human/legal decision required before production.
- **Alternatives:** Storing raw text + identity and aggregating later (rejected: privacy posture, AC-13).
- **Rationale:** AC-10/11/13; data minimization.
- **Consequences:** Demand pipeline is separate from conversation storage; attribute extraction by LLM is validated against controlled vocabulary.
- **Risks:** Legal/retention requirements; tracked as production blocker until human decision.
