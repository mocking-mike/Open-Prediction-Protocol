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

## 10. Review Each Slice

Every completed implementation slice should be followed by a focused code review before moving to the next slice.

- Review the code with a bug-risk and regression-risk mindset.
- Findings should be concrete, severity-ordered, and tied to file references.
- Fix issues that are small and clearly worth doing immediately.
- Fix review findings immediately when they are correctness-critical, protocol-breaking, security-relevant, or likely to cause behavioural regressions.
- If a review finding is real but not worth fixing in the current slice, add it to `roadmap.md` instead of leaving it implicit.
- Do not proceed to the next slice until each review finding is either fixed, explicitly rejected with rationale, or added to `roadmap.md`.

## 11. Review Before Each Milestone

Before starting a new milestone, do a broader consistency review of the current repository state.

- Compare the implementation against `whitepaper.md`, `roadmap.md`, and `.agents/decisions.md`.
- Check that docs and examples do not overclaim beyond what the code and tests actually support.
- Verify that completed roadmap items are genuinely implemented and tested.
- Capture any gaps either as immediate fixes or as explicit roadmap follow-ups.
