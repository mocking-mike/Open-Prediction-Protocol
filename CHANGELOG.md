# Changelog

All notable changes to OPP should be documented in this file.

The format is intentionally simple during the draft phase:

- release heading
- status
- notable additions
- breaking changes when applicable

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
