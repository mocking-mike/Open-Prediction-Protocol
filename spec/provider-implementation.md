# Implementing an OPP Provider

This guide explains how to build a compatible OPP provider without using the reference SDK.

The normative contract is defined in [protocol.md](./protocol.md). This document is an implementation guide, not a replacement for the spec.

## 1. Minimum Surface

To implement the minimal OPP provider surface, expose:

- `GET /.well-known/agent.json`
- `GET /health`
- `POST /rpc`

Your provider does not need to use TypeScript or this repository. It only needs to satisfy the wire contract and schema requirements.

## 2. Discovery

Serve an Agent Card from:

```text
GET /.well-known/agent.json
```

Requirements:

- the response body must validate against [agent-card.schema.json](./agent-card.schema.json)
- `capabilities.predictions` must contain at least one prediction capability
- every advertised capability should reflect something your provider can actually answer
- if you advertise `identity`, keep that identity stable across runtime response metadata and signatures

Minimal example:

```json
{
  "protocolVersion": "0.1.0",
  "name": "weather-provider",
  "url": "https://provider.example.com",
  "capabilities": {
    "predictions": [
      {
        "id": "weather.precipitation.daily",
        "domain": "weather.precipitation",
        "title": "Daily precipitation probability",
        "output": {
          "type": "binary-probability"
        },
        "horizons": ["24h"]
      }
    ]
  }
}
```

## 3. Health

Serve:

```text
GET /health
```

Current expectation:

- return HTTP `200` when operational
- return JSON

The exact health payload is not yet standardized, so a simple object such as `{"status":"ok"}` is sufficient.

## 4. Request Handling

Serve:

```text
POST /rpc
```

Requests must use JSON-RPC `2.0`.

### Non-Streaming Requests

Support method:

```text
predictions.request
```

Requirements:

- `params` must validate against [prediction-request.schema.json](./prediction-request.schema.json)
- the JSON-RPC response `id` must match the request `id`
- on success, `result` must validate against [prediction-response.schema.json](./prediction-response.schema.json)
- `result.requestId` must match `params.requestId`
- completed forecasts must preserve the requested `domain`, `horizon`, and `desiredOutput`
- if you advertise `AgentCard.identity`, emitted response `provider` metadata should match it

Example request:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "predictions.request",
  "params": {
    "requestId": "req-1",
    "createdAt": "2026-03-29T12:00:00Z",
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

Example success response:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": {
    "responseId": "resp-1",
    "requestId": "req-1",
    "status": "completed",
    "createdAt": "2026-03-29T12:00:01Z",
    "provider": {
      "id": "weather-provider"
    },
    "forecast": {
      "type": "binary-probability",
      "domain": "weather.precipitation",
      "horizon": "24h",
      "generatedAt": "2026-03-29T12:00:01Z",
      "probability": 0.42
    }
  }
}
```

## 5. Streaming Requests

Support method:

```text
tasks/sendSubscribe
```

Requirements:

- request `params` must validate against [prediction-request.schema.json](./prediction-request.schema.json)
- return `Content-Type: text/event-stream`
- emit `lifecycle` events for progress
- emit one terminal `result` event whose payload is a valid [prediction-response.schema.json](./prediction-response.schema.json) response
- preserve `requestId` on every lifecycle event
- emit exactly one terminal `result` event and stop after it
- ensure the terminal response preserves the same request and forecast bindings required for non-streaming responses
- if you advertise `AgentCard.identity`, lifecycle-event and terminal-response `provider` metadata should match it

Current `v0.1.0` reference behavior emits:

- `submitted`
- `working`
- one terminal `result`

Lifecycle ordering must follow [prediction-lifecycle.md](./prediction-lifecycle.md).

If validation fails before streaming begins, prefer returning a JSON-RPC error response instead of opening an event stream and then failing immediately.

Example SSE frames:

```text
event: lifecycle
data: {"type":"lifecycle","requestId":"req-1","createdAt":"2026-03-29T12:00:00Z","state":"submitted"}

event: lifecycle
data: {"type":"lifecycle","requestId":"req-1","createdAt":"2026-03-29T12:00:01Z","state":"working","provider":{"id":"weather-provider"}}

event: result
data: {"type":"result","response":{"responseId":"resp-1","requestId":"req-1","status":"completed","createdAt":"2026-03-29T12:00:02Z","provider":{"id":"weather-provider"},"forecast":{"type":"binary-probability","domain":"weather.precipitation","horizon":"24h","generatedAt":"2026-03-29T12:00:02Z","probability":0.42}}}
```

For request-level failures, return structured JSON-RPC errors and prefer sanitized public messages by default.
If operators need raw diagnostics, surface them through trusted logs or explicitly privileged tooling instead of the public protocol response.

## 6. Optional Metadata

You may include optional metadata such as:

- `pricing`
- `calibration`
- `compliance`
- `freshness`
- `signature`
- `provenance`
- `audit`

If you include them, they must match the schema.

Do not emit stronger trust claims in docs or metadata than your runtime can actually maintain on the wire.

## 7. Paid Requests

If you advertise paid pricing options:

- keep the Agent Card pricing metadata accurate
- inspect `request.payment.preferredMethod` when relevant
- inspect `request.payment.authorization` for provider-specific proof or payment context

OPP standardizes the transport-level hook, not the internal settlement logic.

## 8. Signatures

If you return signed responses:

- ensure the response `provider.did` identifies the signer
- keep `provider.did` aligned with the Agent Card DID when you advertise one
- ensure the signed payload covers the response body consistently
- ensure `signature.alg` matches the actual verification algorithm

Current reference behavior uses `Ed25519`.

## 9. Provider Checklist

Before calling your implementation compatible, verify:

- your Agent Card validates against [agent-card.schema.json](./agent-card.schema.json)
- your requests and responses validate against the prediction schemas
- your `/rpc` endpoint supports `predictions.request`
- your `/rpc` endpoint supports `tasks/sendSubscribe`
- your streaming lifecycle order is valid
- your JSON-RPC response `id`, response `requestId`, and completed forecast fields stay bound to the originating request
- your lifecycle and terminal stream events stay bound to the originating request
- your runtime provider identity stays aligned with advertised Agent Card identity when you publish it
- invalid stream requests fail before opening an SSE stream
- your default public errors avoid leaking internal implementation details unless you intentionally expose them
- your provider passes the conformance runner described in [conformance.md](./conformance.md)

## 10. Recommended Flow

1. implement the three HTTP endpoints
2. validate your JSON against the published schemas
3. run the conformance runner against your provider
4. only then add optional features such as signing, paid rails, or compliance filters
