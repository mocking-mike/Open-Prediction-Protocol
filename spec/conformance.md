# OPP Conformance

This document describes the first OPP conformance surface for independent implementations.

## Scope

The `v0.1.0` conformance runner checks the minimal HTTP provider surface defined in [protocol.md](./protocol.md):

- `GET /.well-known/agent.json`
- `GET /health`
- `POST /rpc` with `predictions.request`
- `POST /rpc` with `tasks/sendSubscribe`

It verifies:

- Agent Card schema validity
- basic health endpoint behavior
- JSON-RPC request/response behavior
- JSON-RPC response `id` binding
- prediction response schema validity
- response `requestId`, forecast, and provider-identity binding
- SSE content type and lifecycle/result event flow
- lifecycle ordering consistency
- lifecycle and terminal-result request binding
- stream terminal-result cardinality and "result last" behavior
- warning-level guidance for sanitized invalid-request and invalid-stream-request public errors

## Running the Conformance Check

Use the built-in runner against a provider base URL:

```bash
pnpm run conformance:http -- http://127.0.0.1:3001
```

The command prints a JSON report and exits non-zero on error-level conformance failures.

Warning-level checks are advisory security guidance and do not currently fail the command by themselves.

## Current Limitations

The first conformance surface is intentionally narrow.

It does not yet standardize:

- authenticated or paid conformance flows
- scorer-role conformance
- MCP conformance
- anomaly, compliance, or observability helper behavior
- deployment-specific extensions beyond the minimal HTTP surface

## Goal

The purpose of this suite is to let independent implementations prove that they speak the core OPP provider protocol without depending on internal repo tests or the reference SDK implementation details.

## Independent Interoperability Proof

This repository includes a standalone provider example in [../examples/independent-http-provider.mjs](../examples/independent-http-provider.mjs) that does not use the SDK runtime.

It is used as the first interoperability proof target for the OPP conformance runner.
