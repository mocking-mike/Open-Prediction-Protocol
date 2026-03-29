# Open Prediction Protocol

Reference SDK and schemas for the Open Prediction Protocol (OPP).

OPP standardizes how agents:

- discover prediction providers
- request probabilistic forecasts
- receive structured responses
- compare trust metadata
- compose upstream forecasts
- handle payment metadata

## Status

OPP is currently a public draft protocol and reference SDK in the `0.x` phase. The current wire format and schemas are usable, but they are not yet frozen as a `1.0` standard.

The repository currently includes:

- core JSON Schemas in `spec/`
- runtime validators and TypeScript types
- lifecycle helpers
- transport-agnostic `PredictionAgent` and `PredictionClient`
- x402 transport adapters for paid requests
- Stripe-compatible payment provider adapters
- an MCP server exposing OPP-backed provider discovery and forecast tools
- client-side aggregation across compatible providers
- scorer-role schema, append-only scoring ledger helpers, and binary consensus utilities
- in-memory rate limiting for request and spend control
- a minimal HTTP provider surface
- SSE lifecycle streaming for long-running requests
- observability helpers for scoring, calibration updates, golden-task checks, confidence monitoring, and circuit-breaker decisions
- privacy, anomaly-detection, and compliance helpers for sensitive or regulated deployments
- client-side conditional trigger composition for follow-up prediction requests
- a `create-opp-agent` scaffolding package for bootstrapping new providers
- dual ESM/CJS package builds with bundled schemas and type declarations
- example weather, crypto, and sports providers

## Install

```bash
pnpm install
```

## Validate the Repo

```bash
pnpm run typecheck
pnpm test
pnpm run build:all
```

## Run an Example Provider

Start the weather example provider:

```bash
pnpm run example:weather
```

Then inspect its public endpoints:

```bash
curl http://127.0.0.1:3001/.well-known/agent.json
curl http://127.0.0.1:3001/health
```

Other example providers:

```bash
pnpm run example:crypto
pnpm run example:sports
pnpm run example:signed-paid
pnpm run example:aggregation
```

Additional demos:

- `example:signed-paid` demonstrates signed responses, x402 pricing metadata, and local mock authorization.
- `example:aggregation` starts two local providers and merges their forecasts with `PredictionAggregator`.
- `examples/independent-http-provider.mjs` is a standalone provider that does not use the SDK runtime and is used for interoperability proof.

## Run the Integration Example

```bash
pnpm run integration
```

This script:

- starts a local weather provider
- validates the agent card
- checks the health endpoint
- submits a prediction request over HTTP JSON-RPC
- prints the validated response

## Aggregation

The SDK includes `PredictionAggregator`, which can:

- filter providers by Agent Card compatibility
- fan out one request to multiple providers
- merge completed forecasts using equal weighting or calibration weighting

## Privacy Helpers

For sensitive prompts, the SDK now provides committed privacy requests through
`createCommittedPredictionRequest(...)` in
[`src/security/query-privacy.ts`](./src/security/query-privacy.ts).

The helper returns:

- a schema-valid OPP request with `privacy.mode = "committed"`
- structured `privacy.commitment` metadata carried on the wire
- a local reveal secret that must be stored by the caller if later reveal verification is needed

Current guarantees:

- identical requests are not linkable by passive observers unless the caller deliberately reuses the same reveal secret
- hidden question, resolution, and redacted context values cannot be brute-forced from the on-wire commitments without the local reveal secret
- preserved context keys remain visible to the provider

Current caveats:

- this is a commitment-and-reveal helper, not end-to-end encrypted transport
- the reveal secret should be treated like sensitive local state and disclosed only when later reveal verification is actually needed

## Current HTTP Surface

The minimal provider HTTP surface is:

- `GET /.well-known/agent.json`
- `GET /health`
- `POST /rpc`

### JSON-RPC Method

Current method:

- `predictions.request`
- `tasks/sendSubscribe`

### Streaming Semantics

`tasks/sendSubscribe` returns `text/event-stream` and emits:

- `lifecycle` events for `submitted` and `working`
- one terminal `result` event containing the normal OPP `PredictionResponse`

The reference client binds JSON-RPC responses, stream lifecycle events, provider identity metadata, and terminal results back to the originating request before surfacing them downstream.

The reference HTTP transports also default to bounded response sizes, bounded SSE event sizes, request timeouts, stream idle timeouts, and caller-driven abort support.

If the client disconnects, the reference server now propagates cancellation to provider-side work through an `AbortSignal`.

This keeps the canonical response schema unchanged while allowing long-running providers to expose progress over SSE.

### Example RPC Request

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "predictions.request",
  "params": {
    "requestId": "req-1",
    "createdAt": "2026-03-28T12:00:00Z",
    "consumer": {
      "id": "consumer-1"
    },
    "prediction": {
      "domain": "weather.precipitation",
      "question": "Will rainfall exceed 10mm?",
      "horizon": "24h",
      "desiredOutput": "binary-probability"
    }
  }
}
```

## Project Structure

```text
spec/         Protocol schemas and lifecycle docs
src/          SDK primitives, validators, lifecycle, server/client code
examples/     Runnable example providers and integration entrypoint
packages/     Publishable supporting packages such as create-opp-agent
tests/        Schema, validator, lifecycle, agent/client, and HTTP tests
.agents/      Repo rules, workflows, resources, and decisions log
```

## Roadmap

Implementation status is tracked in:

- [roadmap.md](./roadmap.md)

Compliance deployment guidance is documented in:

- [spec/compliance-profiles.md](./spec/compliance-profiles.md)

The normative protocol contract is documented in:

- [spec/protocol.md](./spec/protocol.md)

Conformance guidance is documented in:

- [spec/conformance.md](./spec/conformance.md)

Security review notes are documented in:

- [spec/security-review.md](./spec/security-review.md)

Independent implementation guides are documented in:

- [spec/provider-implementation.md](./spec/provider-implementation.md)
- [spec/consumer-implementation.md](./spec/consumer-implementation.md)

Independent interoperability proof currently uses:

- [examples/independent-http-provider.mjs](./examples/independent-http-provider.mjs)

Architectural decisions are logged in:

- [.agents/decisions.md](./.agents/decisions.md)

Versioning and compatibility expectations are documented in:

- [VERSIONING.md](./VERSIONING.md)

Lightweight protocol governance is documented in:

- [GOVERNANCE.md](./GOVERNANCE.md)

Release process and notable changes are documented in:

- [RELEASE.md](./RELEASE.md)
- [CHANGELOG.md](./CHANGELOG.md)
