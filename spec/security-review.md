# OPP Security Review

## Status

This document records the focused public-launch security review completed on `2026-03-29`.

## Scope Reviewed

- signature generation and verification
- payment negotiation and authorization hooks
- SSE lifecycle streaming
- minimal public HTTP provider surface

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

## Review Outcome

No remaining finding from this review blocks a public draft launch of OPP as a reference protocol and SDK.
