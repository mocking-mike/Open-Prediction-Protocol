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

The repository currently includes:

- core JSON Schemas in `spec/`
- runtime validators and TypeScript types
- lifecycle helpers
- transport-agnostic `PredictionAgent` and `PredictionClient`
- x402 transport adapters for paid requests
- an MCP server exposing OPP-backed provider discovery and forecast tools
- client-side aggregation across compatible providers
- in-memory rate limiting for request and spend control
- a minimal HTTP provider surface
- example weather, crypto, and sports providers

## Install

```bash
pnpm install
```

## Validate the Repo

```bash
pnpm run typecheck
pnpm test
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

- `example:signed-paid` demonstrates signed responses and x402-priced access with local mock authorization.
- `example:aggregation` starts two local providers and merges their forecasts with `PredictionAggregator`.

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

## Current HTTP Surface

The minimal provider HTTP surface is:

- `GET /.well-known/agent.json`
- `GET /health`
- `POST /rpc`

### JSON-RPC Method

Current method:

- `predictions.request`

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
tests/        Schema, validator, lifecycle, agent/client, and HTTP tests
.agents/      Repo rules, workflows, resources, and decisions log
```

## Roadmap

Implementation status is tracked in:

- [roadmap.md](./roadmap.md)

Architectural decisions are logged in:

- [.agents/decisions.md](./.agents/decisions.md)
