# Implementing an OPP Consumer

This guide explains how to build an OPP consumer without using the reference SDK.

The normative contract is defined in [protocol.md](./protocol.md). This document is a practical integration guide.

## 1. Consumer Responsibilities

An OPP consumer typically does four things:

1. discover providers
2. decide which provider is acceptable
3. submit a prediction request
4. validate and use the response

## 2. Discover Providers

Fetch:

```text
GET /.well-known/agent.json
```

Validate the result against [agent-card.schema.json](./agent-card.schema.json).

At minimum, check:

- provider `name`
- provider `url`
- `capabilities.predictions`
- optional `identity`
- optional `pricing`
- optional `calibration`
- optional `compliance`

## 3. Match Capabilities

Pick a provider capability that matches your request:

- `domain`
- `desiredOutput`
- `horizon`

If the provider does not advertise a matching capability, do not assume it can satisfy the request.

Capability matching is a discovery-time filter, not a substitute for validating the returned forecast against the request you actually sent.

## 4. Build a Request

Create a request that validates against [prediction-request.schema.json](./prediction-request.schema.json).

Minimal example:

```json
{
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
```

You may add optional fields for:

- `constraints`
- `privacy`
- `payment`

If you use `privacy.mode = "committed"`, keep the local reveal secret returned by the SDK helper.
The on-wire request carries only commitment metadata; later reveal verification depends on that local secret.

## 5. Send a Non-Streaming Request

Call:

```text
POST /rpc
```

with JSON-RPC method:

```text
predictions.request
```

Example envelope:

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

Validate the returned `result` against [prediction-response.schema.json](./prediction-response.schema.json).

Before accepting the result, also verify:

- the JSON-RPC response `id` matches your request `id`
- `result.requestId` matches your original `requestId`
- completed forecasts preserve the requested `domain`, `horizon`, and `desiredOutput`
- if you discovered `AgentCard.identity`, the runtime `result.provider` identity is consistent with it

## 6. Send a Streaming Request

To receive lifecycle updates, call:

```text
POST /rpc
```

with JSON-RPC method:

```text
tasks/sendSubscribe
```

Expect:

- `Content-Type: text/event-stream` on success
- or a JSON-RPC error response if the provider rejects the request before streaming begins
- `lifecycle` events
- one terminal `result` event

You should not treat the request as complete until you receive the terminal `result` event.

For each stream, also verify:

- every `lifecycle` event preserves the original `requestId`
- any `provider` metadata carried in lifecycle events or the terminal response stays consistent with the discovered Agent Card identity when available
- the terminal response preserves the same request and forecast bindings required for non-streaming requests
- the stream emits exactly one terminal `result` event and stops after it

## 7. Validate Trust Metadata

If the provider returns optional trust metadata:

- check `freshness.timestamp`
- check `freshness.recipientDid` if you require recipient binding
- verify signatures when `provider.did` and `signature` are present
- compare `provider.id` and `provider.did` against discovered Agent Card identity metadata when you have it
- treat `calibration` as domain-specific, not globally transferable

If your deployment relies on signatures, fail closed when verification fails.

Do not trust schema-valid signatures alone if they identify a different provider than the Agent Card you selected.

## 8. Paid Requests

If a provider advertises paid pricing:

- inspect `pricing.options` from the Agent Card
- choose a supported method
- set `request.payment.preferredMethod`
- include provider-specific payment proof or context in `request.payment.authorization` when required

OPP does not require one payment rail. It gives you a standard place to express payment intent and request-bound payment context.

## 9. Compliance and Risk Filtering

If your deployment has policy constraints, use the provider’s optional compliance metadata to screen candidates before sending requests.

Typical checks:

- `riskLevel`
- `humanOversight`
- calibration verification status

OPP metadata is an input to policy, not a legal conclusion by itself.

## 10. Deployment Caveats

Keep resource limits and trust boundaries explicit in production:

- do not remove transport body limits, SSE event limits, request timeouts, or stream idle timeouts unless you have an equivalent guard elsewhere
- treat public error strings as user-facing status, not as a stable diagnostics interface
- for `privacy.mode = "committed"`, store the local reveal secret securely and remember that preserved context keys remain visible to the provider
- if you build a custom client instead of using the reference SDK, add abort handling so stalled providers do not hold resources indefinitely

## 11. Consumer Checklist

Before calling your client production-ready for OPP `v0.1.0`, verify:

- Agent Cards are schema-validated
- prediction requests are schema-validated
- prediction responses are schema-validated
- JSON-RPC method names are correct
- JSON-RPC response `id` is bound to the originating request
- response `requestId` and completed forecast fields are bound to the originating request
- SSE streams are parsed correctly
- lifecycle ordering is handled correctly
- lifecycle and terminal result events are bound to the originating request
- runtime provider identity is checked against discovered Agent Card identity when relied upon
- optional signatures are verified when relied upon
- default transport size and timeout limits are enabled or replaced with equivalent controls
- payment proof is bound to the request when using paid providers

## 12. Recommended Flow

1. fetch and validate Agent Cards
2. filter providers by capability and policy
3. build a schema-valid request
4. send either `predictions.request` or `tasks/sendSubscribe`
5. validate response IDs, request binding, provider identity, and the response or terminal stream result
6. only then feed the forecast into downstream decision logic
