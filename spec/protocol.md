# OPP Protocol Specification

## Status

This document is the normative protocol specification for OPP `v0.1.0`.

Unless otherwise stated, the keywords `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, and `MAY` are to be interpreted as normative requirements for interoperable implementations.

The following documents are part of the normative OPP protocol surface:

- [agent-card.schema.json](./agent-card.schema.json)
- [prediction-request.schema.json](./prediction-request.schema.json)
- [prediction-response.schema.json](./prediction-response.schema.json)
- [prediction-lifecycle.md](./prediction-lifecycle.md)
- [scorer-agent-card.schema.json](./scorer-agent-card.schema.json)

The following documents are informative and non-normative:

- [../whitepaper.md](../whitepaper.md)
- [compliance-profiles.md](./compliance-profiles.md)
- examples in [../examples](../examples)

## 1. Scope

OPP defines how agents:

- advertise prediction capabilities
- submit structured prediction requests
- return structured prediction responses
- expose trust, payment, and compliance metadata
- stream lifecycle progress for long-running requests

OPP does not define:

- how a provider generates a forecast
- how providers settle payments internally
- how compliance obligations are legally satisfied
- how independent scorer networks are coordinated

## 2. Core Documents

### 2.1 Agent Cards

Provider discovery data MUST validate against [agent-card.schema.json](./agent-card.schema.json).

Independent scorer discovery data MUST validate against [scorer-agent-card.schema.json](./scorer-agent-card.schema.json) when a scorer role is being advertised.

### 2.2 Prediction Requests

Prediction requests MUST validate against [prediction-request.schema.json](./prediction-request.schema.json).

### 2.3 Prediction Responses

Prediction responses MUST validate against [prediction-response.schema.json](./prediction-response.schema.json).

### 2.4 Lifecycle

Lifecycle state transitions MUST follow [prediction-lifecycle.md](./prediction-lifecycle.md).

## 3. Discovery

A provider that exposes the reference OPP HTTP surface MUST serve an Agent Card at:

```text
GET /.well-known/agent.json
```

The response body MUST be valid against [agent-card.schema.json](./agent-card.schema.json).

Providers MAY expose additional discovery mechanisms, but `/.well-known/agent.json` is the normative discovery path for the minimal HTTP surface.

## 4. Health

A provider that exposes the reference OPP HTTP surface MUST serve:

```text
GET /health
```

The endpoint SHOULD return an HTTP `200` status when the provider is operational.

The exact shape of the health payload is not currently standardized beyond being machine-readable JSON.

## 5. Prediction Request Delivery

The minimal OPP HTTP surface uses:

```text
POST /rpc
```

Requests MUST use JSON-RPC `2.0`.

### 5.1 Standard Method

For non-streaming delivery, the JSON-RPC method name MUST be:

```text
predictions.request
```

The `params` value MUST be a prediction request that validates against [prediction-request.schema.json](./prediction-request.schema.json).

The JSON-RPC response `id` MUST equal the originating request `id`.

On success, the JSON-RPC result MUST be a prediction response that validates against [prediction-response.schema.json](./prediction-response.schema.json).

The prediction response `requestId` MUST equal the originating prediction request `requestId`.

If the prediction response has `status = "completed"`, the returned forecast:

- `domain` MUST equal `prediction.domain`
- `horizon` MUST equal `prediction.horizon`
- `type` MUST equal `prediction.desiredOutput`

### 5.2 Streaming Method

For lifecycle streaming, the JSON-RPC method name MUST be:

```text
tasks/sendSubscribe
```

The `params` value MUST be a prediction request that validates against [prediction-request.schema.json](./prediction-request.schema.json).

The HTTP response MUST use:

```text
Content-Type: text/event-stream
```

The stream MUST emit:

- `lifecycle` events for non-terminal lifecycle updates
- one terminal `result` event containing the final prediction response payload

Each `lifecycle` event `requestId` MUST equal the originating prediction request `requestId`.

The terminal `result` payload MUST validate against [prediction-response.schema.json](./prediction-response.schema.json).

The terminal `result` payload `requestId` MUST equal the originating prediction request `requestId`.

If the terminal `result` payload has `status = "completed"`, the returned forecast:

- `domain` MUST equal `prediction.domain`
- `horizon` MUST equal `prediction.horizon`
- `type` MUST equal `prediction.desiredOutput`

The stream MUST emit exactly one terminal `result` event.

Providers MUST NOT emit additional events after the terminal `result`.

Providers MUST NOT emit additional lifecycle states that violate [prediction-lifecycle.md](./prediction-lifecycle.md).

Current `v0.1.0` reference behavior emits:

- `submitted`
- `working`
- one terminal `result`

If the streaming client disconnects, providers SHOULD stop provider-side work promptly when their runtime can observe cancellation.

### 5.3 Error Behavior

If a provider cannot accept or process a request, it SHOULD return a structured JSON-RPC error for request-level failures.

If a `tasks/sendSubscribe` request fails before streaming begins, the provider SHOULD return a JSON-RPC error response instead of opening an event stream and then failing immediately.

If execution begins and then fails within the prediction lifecycle, the provider SHOULD map that failure into the lifecycle model described in [prediction-lifecycle.md](./prediction-lifecycle.md).

The exact JSON-RPC error object taxonomy is not yet frozen in `v0.1.0`.

## 6. Trust and Security Metadata

Where present, trust and security metadata such as:

- signatures
- freshness bounds
- recipient binding
- provenance references
- calibration metadata

MUST use the fields and constraints defined by the applicable schemas.

Implementations MAY omit optional trust metadata unless a deployment policy requires it.

When a provider advertises `AgentCard.identity`, any runtime `provider` identity metadata it emits in prediction responses or lifecycle events SHOULD describe the same provider identity.

When a prediction response is signed, `provider.did` SHOULD identify the signer, and consumers that rely on signatures SHOULD compare that DID against discovered Agent Card identity metadata when it is available.

## 7. Payments

Providers MAY advertise one or more payment options through Agent Card metadata.

Payment metadata MUST conform to the applicable schema fields in [agent-card.schema.json](./agent-card.schema.json).

Prediction requests MAY include provider-specific payment proof or authorization context in the `payment.authorization` object defined by [prediction-request.schema.json](./prediction-request.schema.json).

OPP standardizes payment advertisement and request/response compatibility hooks. It does not require one specific settlement rail.

## 8. Compliance and Oversight Metadata

Providers MAY advertise compliance-related metadata, including risk and human-oversight declarations, through Agent Card fields defined by the schemas.

Consumers MAY use those fields for provider filtering or deployment policy enforcement.

OPP does not define legal compliance outcomes. It defines interoperable metadata for systems that need those controls.

## 9. Extensibility

Implementations MAY add:

- additional helper APIs
- additional non-conflicting endpoints
- additional internal metadata

Implementations MUST NOT:

- redefine the meaning of existing required schema fields
- reuse standard method names for incompatible behavior
- emit standard lifecycle states with incompatible semantics

## 10. Relationship to Other Documents

This document and the JSON Schemas define the interoperable contract.

The whitepaper explains motivation, positioning, and design intent, but it is not normative.
