# Decisions Log

A chronological record of architectural and technical decisions made during the implementation of the Open Prediction Protocol. Each entry explains **what** was decided, **why**, and **what alternatives were rejected**.

> **For agents:** Before making a related decision, read existing entries to ensure consistency. After making a new decision, append an entry using the format defined in `.agents/workflows/log-decision.md`.

---

<!-- Decisions will be appended below this line -->

### DEC-001 — Primary language: TypeScript
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Use TypeScript (Node.js) as the sole language for the reference SDK.
- **Why:** It fits the intended SDK shape, works well with JSON Schema tooling, and aligns with the surrounding Node-based agent/tooling ecosystem.
- **Alternatives rejected:** Python, Hybrid TS+Python

### DEC-002 — Package manager: pnpm
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Use `pnpm` as the default package manager.
- **Why:** It is fast, strict about dependency resolution, and suits a repo that will likely grow into multiple packages and examples.
- **Alternatives rejected:** `npm`, `yarn`

### DEC-003 — Schema-first design: JSON Schema as source of truth
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** JSON Schema files in `spec/` are the canonical source of truth for the protocol.
- **Why:** OPP is a protocol, so the schema is part of the specification and should remain language-agnostic.
- **Alternatives rejected:** TypeScript-first schema definitions, Protobuf

### DEC-004 — OPP is a protocol layer only
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** OPP defines how agents discover, request, receive, compare, and compose probabilistic forecasts; it does not define how forecasts are generated.
- **Why:** Keeping scope narrow improves clarity, composability, and adoption.
- **Alternatives rejected:** Treating OPP as a forecasting engine, Treating OPP as a marketplace application

### DEC-005 — Domain-scoped calibration is required
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Calibration metadata must be modeled per domain rather than as one global provider score.
- **Why:** Trust should be specific to the prediction domain, not diluted across unrelated tasks.
- **Alternatives rejected:** Single global calibration score

### DEC-006 — Independent verification is a first-class trust model
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** The protocol must distinguish between self-reported and independently verified calibration evidence.
- **Why:** Self-reported performance is insufficient as a long-term trust mechanism.
- **Alternatives rejected:** Self-reported scoring only

### DEC-007 — Payment is abstracted behind protocol metadata
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** OPP represents payment support as protocol metadata rather than binding the protocol to one rail.
- **Why:** This preserves interoperability across free, crypto-native, and fiat-friendly deployments.
- **Alternatives rejected:** One mandatory payment mechanism

### DEC-008 — Schema-forward optionality
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** The initial schemas include optional hooks for trust, payment, compliance, freshness, and composition even when some infrastructure ships later.
- **Why:** This reduces the risk of schema-breaking changes once early implementations appear.
- **Alternatives rejected:** Adding protocol fields only when each subsystem is implemented

### DEC-009 — Reusable upstream forecasts are first-class composition targets
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** OPP should support chained provenance so shared upstream forecast artifacts can feed multiple private downstream prediction workflows.
- **Why:** Many final-use predictions are too bespoke to share directly, but upstream forecast components remain reusable and economically meaningful.
- **Alternatives rejected:** Treating composition only as end-to-end final prediction chaining

### DEC-010 — Bootstrap trust and payment fields remain optional in v0.1 schemas
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** The initial schemas require the core prediction contract fields, while signatures, pricing metadata, calibration metadata, provenance, and freshness remain optional.
- **Why:** This keeps the protocol usable for early providers and examples without weakening the shape of the core discovery and forecast exchange contract.
- **Alternatives rejected:** Requiring all trust and payment infrastructure from the first schema version

### DEC-011 — Minimal v0.1 lifecycle with four states
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Use a minimal lifecycle of `submitted`, `working`, `completed`, and `failed` for v0.1.
- **Why:** These states are enough for interoperable client and provider behavior without introducing orchestration complexity before transport semantics are implemented.
- **Alternatives rejected:** Adding `input-required`, `cancelled`, or partial-result states in v0.1

### DEC-012 — Initial provider transport uses built-in Node HTTP with JSON-RPC
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Implement the first provider surface with built-in Node HTTP, exposing `/.well-known/agent.json`, `/health`, and a JSON-RPC `POST /rpc` endpoint for prediction requests.
- **Why:** This is enough to make the protocol callable over HTTP without prematurely locking the SDK into a larger web framework.
- **Alternatives rejected:** Deferring HTTP entirely, Adopting a framework before the first provider surface exists

### DEC-013 — Initial signing layer uses minimal did:key over Ed25519
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Implement initial identity and signature support with `did:key`-style Ed25519 identities using Node crypto and lightweight multibase encoding, rather than introducing a full DID framework immediately.
- **Why:** This gives OPP real verifiable signatures and provider identities in M3 while keeping the SDK lean and reducing framework commitment too early.
- **Alternatives rejected:** Deferring signing entirely, Adopting a full DID framework before the initial trust layer exists

### DEC-014 — x402 integration uses thin adapter wrappers over official packages
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Integrate machine-native payment support by wrapping `@x402/express` and `@x402/fetch` directly, while keeping OPP-specific payment negotiation separate from the x402 transport adapters.
- **Why:** This preserves a clean boundary between protocol-level payment metadata and one concrete payment rail, while avoiding bespoke payment transport logic inside OPP.
- **Alternatives rejected:** Building custom x402 transport code, Binding all payment flow directly into `PredictionClient` and `PredictionAgent`

### DEC-015 — Client aggregation defaults to equal-weight merge with optional calibration weighting
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Implement multi-provider aggregation as a client-side utility that fans out one validated request to compatible providers and merges completed forecasts using equal weighting by default, with optional domain-calibration weighting.
- **Why:** Equal weighting is stable and easy to reason about for v0.1, while calibration-aware weighting uses existing protocol metadata without forcing one trust model across all deployments.
- **Alternatives rejected:** Making aggregation a fake provider identity, Requiring calibration weighting in all cases, Deferring aggregation until a scorer network exists

### DEC-016 — Rate limiting is enforced inside `PredictionAgent` before handler execution
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Apply per-consumer request and spend limits inside `PredictionAgent`, after payment negotiation selects a pricing option but before payment authorization and handler execution.
- **Why:** This lets providers reject over-budget or over-volume requests early, with one control point that understands both request identity and pricing metadata.
- **Alternatives rejected:** External middleware only, Handler-level rate limiting, Applying spend controls only after payment authorization

### DEC-017 — MCP integration uses a stdio server with provider discovery, single-request, and aggregation tools
- **Date:** 2026-03-28
- **Status:** accepted
- **Choice:** Expose OPP through a dedicated MCP server built on `@modelcontextprotocol/sdk`, using `stdio` transport and a narrow initial tool surface: `list_providers`, `request_prediction`, and `aggregate_predictions`.
- **Why:** This gives agent frameworks a direct way to consume OPP providers without forcing HTTP transport assumptions into MCP, while keeping the first MCP surface focused on discovery and forecast consumption.
- **Alternatives rejected:** Deferring MCP entirely, Exposing OPP as prompts/resources before tools, Binding MCP to HTTP-specific server state
