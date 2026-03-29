# Repo Rules

These rules apply to implementation work in this repository.

## 1. Protocol First

Treat OPP as a protocol repository.

- Prefer protocol-level abstractions over app-level abstractions.
- Do not introduce forecasting-engine logic.
- Do not introduce marketplace or demand-aggregation logic.
- Keep the repository focused on discovery, request/response contracts, trust metadata, payment metadata, and composition primitives.

## 2. Schema First

The protocol contract starts in `spec/`.

- Define or update schemas before building SDK behavior around them.
- Prefer additive schema changes.
- Do not make breaking schema changes casually.
- If a schema change is meaningfully architectural, log it in `.agents/decisions.md`.

## 3. Contract Tests Before Implementation

For protocol payloads and lifecycle semantics:

- write or update validation tests first
- then implement validators, types, and helpers
- then build client or server behavior on top

Full TDD is not required for every small utility, but contract-facing behavior should be test-led.

## 4. Field Discipline

Every new protocol field should have a clear answer to:

- What problem does it solve?
- Is it protocol-level or implementation-specific?
- Is it required or optional?
- How is it validated?
- Is it safe for bootstrap deployments?
- Does it create future compatibility risk?

If those answers are unclear, the field is probably premature.

## 5. Examples Are Not the Spec

- Example providers and payloads should validate against the schemas.
- Do not treat examples as authoritative if the schemas and tests do not enforce the same behavior.
- Keep examples simple enough to teach the protocol, not to showcase product ambition.

## 6. Trust Metadata Must Stay Honest

- Distinguish provisional, self-reported, and independently verified trust signals.
- Do not encode stronger trust claims in docs or examples than the implementation actually supports.
- Preserve domain-scoped trust and scoring semantics.

## 7. Keep Scope Narrow

When in doubt, prefer:

- simpler lifecycle
- smaller schema surface
- optional hooks instead of premature infrastructure
- protocol interoperability over product completeness

## 8. Update the Roadmap When Work Lands

The roadmap is a working execution document, not a static plan.

- When a roadmap task is completed, update `roadmap.md` in the same workstream.
- Mark tasks accurately as done, in progress, or not started.
- Do not mark roadmap items complete unless the code, docs, or tests actually support that status.
- If implementation changes the meaning or sequencing of roadmap work, update the roadmap text as well.

## 9. Log Decisions

Every non-trivial technical or architectural decision **must** be logged.

- Follow the `/log-decision` workflow (`.agents/workflows/log-decision.md`) for format and criteria.
- Append entries to `.agents/decisions.md` — never edit or remove past entries.
- Read existing decisions **before** making a related choice to ensure consistency.
- When in doubt about whether something is "non-trivial," log it — a short entry costs less than a lost rationale.
