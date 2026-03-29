# OPP Security Review

## Status

This document records:

- the focused public-launch security review completed on `2026-03-29`
- a supplemental runtime trust-path review completed on `2026-03-29`

## Scope Reviewed

- signature generation and verification
- payment negotiation and authorization hooks
- consumer-side request/response binding and provider identity checks
- SSE lifecycle streaming
- minimal public HTTP provider surface
- privacy helpers for committed requests
- public error surfaces on reference agent and server paths

## Findings and Disposition

### 1. Payment authorization was not request-bound

**Finding:** paid authorization hooks previously received only the static pricing option, not the request that carried payment intent or proof.

**Risk:** x402 or Stripe-compatible flows could not reliably bind authorization to consumer-supplied payment context.

**Disposition:** fixed.

Current behavior:

- `PredictionRequest.payment.authorization` can carry provider-specific proof or payment context
- payment providers receive both the negotiated pricing option and the full request

### 2. Signature verification ignored declared algorithm metadata

**Finding:** signature verification previously verified against the provider DID without first rejecting unsupported `signature.alg` values.

**Risk:** metadata could claim an algorithm that did not match the actual verification path, which weakens verifier trust in the signed envelope.

**Disposition:** fixed.

Current behavior:

- `verifyPredictionResponseSignature(...)` rejects unsupported algorithms before verification
- `Ed25519` is the currently supported signature algorithm

### 3. Abort-aware SSE cancellation

**Finding:** disconnecting a streaming client does not yet propagate cancellation into provider-side work.

**Risk:** long-running streamed requests may continue consuming resources after client disconnect.

**Disposition:** fixed for the reference streaming path.

Current behavior:

- the reference HTTP server aborts streaming work when the client disconnects
- the prediction handler receives an `AbortSignal` so provider implementations can stop work promptly

### 4. Reference consumer trust path does not fully bind responses to requests or discovered providers

**Finding:** the current reference consumer validates response shape and can optionally verify a signature against the DID embedded in the response, but it does not fully bind the runtime trust path to the originating request or the discovered provider identity.

**Risk:** replayed, substituted, or cross-provider responses can be accepted by the default client path and then flow into aggregation or MCP surfaces.

**Disposition:** fixed for the reference client path.

Current behavior:

- the HTTP and x402 transports reject JSON-RPC responses whose `id` does not match the active request
- `PredictionClient` binds completed and failed responses to the originating `requestId`
- completed responses are checked for matching forecast `domain`, `horizon`, and output type
- aggregation and direct MCP request paths now pass the selected Agent Card into runtime validation
- provider identity is checked against Agent Card identity metadata when that metadata is available
- stream validation now binds lifecycle and terminal result events to the active request and rejects streams without one terminal result

### 5. Query privacy helper provided deterministic commitments under a misleading "blinded" name

**Finding:** the previous privacy helper replaced cleartext values with placeholders and deterministic SHA-256 hashes of canonicalized inputs.

**Risk:** identical requests were linkable across sessions, and low-entropy questions or context could be guessed offline. The old "blinded" name overstated the privacy guarantees.

**Disposition:** fixed for the canonical helper and schema path.

Current behavior:

- the canonical privacy mode is now `privacy.mode = "committed"` with structured `privacy.commitment` metadata
- the reference helper generates a fresh local reveal secret per request and uses HMAC-based commitments instead of deterministic public hashes
- identical requests are not linkable by passive observers unless the caller intentionally reuses the same reveal secret
- reveal verification now requires both the original request and the local reveal secret
- the helper is documented as a commitment-and-reveal privacy aid, not as transport encryption or formal cryptographic blinding

### 6. Reference SSE client accepts unbounded event buffers

**Finding:** the SSE client accumulates bytes until it observes a frame delimiter and does not impose a per-frame cap, total cap, or timeout.

**Risk:** a malicious or buggy provider can exhaust consumer memory or hold resources indefinitely through never-terminated or oversized frames.

**Disposition:** fixed for the reference transport path.

Current behavior:

- `HttpPredictionTransport` and `X402HttpPredictionTransport` bound JSON response body size
- `HttpPredictionTransport` bounds in-flight SSE event size instead of accepting unbounded buffered frames
- non-streaming requests now enforce transport timeouts
- streaming requests now enforce idle timeouts
- transport send/stream operations accept caller-provided abort signals

### 7. Default public error surfaces reflect raw internal exception strings

**Finding:** the reference agent and HTTP server expose raw exception messages in failed prediction responses and JSON-RPC errors.

**Risk:** internal vendor errors, policy details, payment configuration, and rate-limit behavior can leak to callers by default.

**Disposition:** fixed for the reference agent and HTTP server paths.

Current behavior:

- `PredictionAgent` now returns category-safe default public messages instead of raw exception strings for handler, payment, and rate-limit failures
- `PredictionHttpServer` now returns sanitized JSON-RPC error messages for request validation and internal failures by default
- invalid streamed requests are validated before SSE headers flush so the server can return a structured JSON-RPC error instead of an empty `200` response
- trusted deployments can opt into detailed public messages with `exposeErrorDetails`
- agent and server callers can capture raw errors plus structured public-error context through `errorReporter` hooks

## Review Outcome

The original public-launch review findings were fixed. The supplemental review identified additional hardening work; the request/provider trust-path binding, reference transport streaming-bound, default public error-sanitization, and privacy-helper findings have now been addressed.

These findings do not invalidate OPP as a public draft protocol, but they should be addressed before presenting the reference SDK as security-hardened for adversarial or multi-tenant production environments.
