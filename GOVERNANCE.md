# Governance

## Purpose

This document defines the lightweight governance model for OPP while the protocol is in its public draft phase.

The goal is to make protocol evolution explicit and reviewable without pretending the project already has a formal standards body.

## Current Project Role

At this stage, OPP is:

- a public draft protocol
- a reference SDK
- a conformance surface for early independent implementations

It is not yet a formally governed industry standard.

## Decision Layers

OPP changes fall into three categories:

1. editorial changes
2. implementation changes
3. protocol changes

### Editorial Changes

Examples:

- documentation clarifications
- typo fixes
- examples that do not change protocol meaning

These may be merged through normal review.

### Implementation Changes

Examples:

- internal SDK refactors
- additional helper APIs
- test improvements
- packaging or release workflow changes

These may be merged through normal review, but must keep the public protocol documents coherent.

### Protocol Changes

Examples:

- schema changes
- HTTP route or JSON-RPC method changes
- lifecycle semantic changes
- signature or payment contract changes
- conformance requirement changes

These require explicit protocol review before merge.

## Protocol Change Process

A protocol change should include:

1. a clear problem statement
2. the proposed change
3. compatibility impact
4. updates to the relevant normative documents
5. tests or conformance updates
6. a logged architectural decision in [.agents/decisions.md](./.agents/decisions.md)

Before merge, protocol changes should update whichever documents are affected:

- [spec/protocol.md](./spec/protocol.md)
- JSON schemas in [spec/](./spec)
- [VERSIONING.md](./VERSIONING.md)
- [roadmap.md](./roadmap.md)
- conformance docs or runners when applicable

## Approval Expectations

During the draft phase:

- no protocol-affecting change should merge without explicit maintainer approval
- breaking protocol changes should be called out clearly in the pull request or change note
- unresolved review findings must be fixed, rejected with rationale, or tracked in the roadmap before the next slice continues

## Source of Truth

The current source of truth for OPP is:

1. normative protocol documents in [spec/](./spec)
2. published JSON schemas in [spec/](./spec)
3. compatibility policy in [VERSIONING.md](./VERSIONING.md)
4. accepted design decisions in [.agents/decisions.md](./.agents/decisions.md)

The whitepaper is explanatory and non-normative.

## Path Toward Stronger Governance

This governance model is intentionally minimal.

It should evolve before `1.0.0` to include:

- at least one independent implementation voice
- clearer release and change-notice discipline
- a more explicit process for accepting or rejecting protocol proposals

Until then, this document exists to reduce ambiguity, not to simulate a foundation that does not yet exist.
