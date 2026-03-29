# Changelog

All notable changes to OPP should be documented in this file.

The format is intentionally simple during the draft phase:

- release heading
- status
- notable additions
- breaking changes when applicable

## [Unreleased]

In progress toward the next draft release.

### Changed

- replace `privacy.mode = "blinded"` with `privacy.mode = "committed"` and structured `privacy.commitment` metadata
- switch the reference privacy helper from deterministic public hashes to per-request HMAC commitments with local reveal secrets
- expand HTTP provider conformance and regression coverage for request binding, provider identity mismatches, malformed streams, and sanitized invalid-request errors
- document runtime trust-path binding, stream-shape invariants, committed-privacy caveats, and default error-handling guidance across the protocol and implementer docs

### Breaking

- the canonical query-privacy helper is now `createCommittedPredictionRequest(...)`, which returns `{ request, reveal }` so callers can retain the local reveal secret needed for later verification

## [0.1.0] - 2026-03-29

Initial public draft release.

### Added

- normative OPP schemas for provider discovery, prediction requests, prediction responses, and scorer roles
- reference TypeScript SDK for provider, client, HTTP transport, streaming, payments, aggregation, and trust metadata
- SSE lifecycle streaming over `tasks/sendSubscribe`
- observability helpers for calibration, scoring, monitoring, and circuit-breaking
- scoring, privacy, anomaly detection, compliance, and conditional composition helpers
- `create-opp-agent` scaffolding package
- normative protocol, conformance, security review, governance, and implementation guides

### Notes

- OPP is still in the `0.x` draft phase
- the protocol and SDK are public, but not yet frozen as a `1.0` standard
