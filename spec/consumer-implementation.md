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
- optional `pricing`
- optional `calibration`
- optional `compliance`

## 3. Match Capabilities

Pick a provider capability that matches your request:

- `domain`
- `desiredOutput`
- `horizon`

If the provider does not advertise a matching capability, do not assume it can satisfy the request.

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

- `Content-Type: text/event-stream`
- `lifecycle` events
- one terminal `result` event

You should not treat the request as complete until you receive the terminal `result` event.

## 7. Validate Trust Metadata

If the provider returns optional trust metadata:

- check `freshness.timestamp`
- check `freshness.recipientDid` if you require recipient binding
- verify signatures when `provider.did` and `signature` are present
- treat `calibration` as domain-specific, not globally transferable

If your deployment relies on signatures, fail closed when verification fails.

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

## 10. Consumer Checklist

Before calling your client production-ready for OPP `v0.1.0`, verify:

- Agent Cards are schema-validated
- prediction requests are schema-validated
- prediction responses are schema-validated
- JSON-RPC method names are correct
- SSE streams are parsed correctly
- lifecycle ordering is handled correctly
- optional signatures are verified when relied upon
- payment proof is bound to the request when using paid providers

## 11. Recommended Flow

1. fetch and validate Agent Cards
2. filter providers by capability and policy
3. build a schema-valid request
4. send either `predictions.request` or `tasks/sendSubscribe`
5. validate the response or terminal stream result
6. only then feed the forecast into downstream decision logic
