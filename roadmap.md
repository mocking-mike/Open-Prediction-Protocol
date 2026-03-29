# Open Prediction Protocol — Roadmap

A milestone-based implementation plan for Open Prediction Protocol.

This roadmap is intentionally limited to `OPP`. It covers the schemas, SDK, trust metadata, payment abstraction, and composition primitives required for agent-to-agent forecast exchange.

It does **not** cover:

- forecast generation engines
- demand aggregation services
- end-user marketplace applications

Detailed technical decisions are logged in [decisions.md](file:///Users/michal/Open%20Prediction%20Protocol/.agents/decisions.md).

---

## Milestones

**Status legend:** `[x]` done, `[~]` in progress, `[ ]` not started

### Milestone 1 — Protocol Specification & Core Library
**Goal:** Define the protocol's canonical schemas and validation layer so forecast exchange can be implemented consistently across providers and consumers.

| # | Task | Purpose |
|---|---|---|
| [x] 1.1 | Project scaffold (`package.json`, `tsconfig`, directories) | Establish SDK foundation |
| [x] 1.2 | Write `spec/agent-card.schema.json` with prediction domains, trust metadata, pricing options, and compliance fields | Provider discovery and filtering |
| [x] 1.3 | Write `spec/prediction-request.schema.json` with domain, horizon, constraints, and privacy fields | Standardized request contract |
| [x] 1.4 | Write `spec/prediction-response.schema.json` with probabilities, provenance, freshness, audit metadata, and signatures | Standardized response contract |
| [x] 1.5 | Write `spec/prediction-lifecycle.md` for request, progress, completion, and failure states | Lifecycle semantics |
| [x] 1.6 | Create `src/types/index.ts` from the protocol schemas | Type-safe SDK surface |
| [x] 1.7 | Create `src/schemas/index.ts` with `ajv` validators | Runtime validation |
| [x] 1.8 | Write schema validation tests | Spec correctness |
| [x] 1.9 | Write `whitepaper.md` describing OPP scope, trust metadata, and composition patterns | Public protocol framing |

**Verification:** `pnpm run typecheck && pnpm test`

**Notes:**

- The schemas include hooks for trust, compliance, payments, and composition from the start to avoid later breaking changes.
- Infrastructure behind some optional fields ships in later milestones.

---

### Milestone 2 — Reference SDK & Bootstrap Providers
**Goal:** Prove that OPP works end-to-end by shipping a provider SDK, a consumer SDK, and a few simple providers that expose real forecasts through the protocol.

| # | Task | Purpose |
|---|---|---|
| [x] 2.1 | Build `PredictionAgent` server with Agent Card, JSON-RPC endpoints, and `/health` | Reference provider implementation |
| [x] 2.2 | Implement lifecycle state machine (`submitted` → `working` → `completed` / `failed`) | Consistent execution flow |
| [x] 2.3 | Build `PredictionClient` for discovery, request submission, and response validation | Reference consumer implementation |
| [x] 2.4 | Implement `FreePaymentProvider` for bootstrap and development use | Zero-friction early adoption |
| [x] 2.5 | Create `examples/weather-proxy.ts` that wraps an external weather API in OPP format | Reusable upstream forecast example |
| [x] 2.6 | Create `examples/crypto-proxy.ts` that wraps an external market-data API in OPP format | Second provider example |
| [x] 2.7 | Create `examples/sports-proxy.ts` that wraps an external sports API in OPP format | Third provider example |
| [x] 2.8 | Write lifecycle and client tests | SDK correctness |
| [x] 2.9 | Create `examples/integration-test.ts` for end-to-end smoke testing | End-to-end verification |
| [x] 2.10 | Write `README.md` with quick-start setup for providers and consumers | Developer onboarding |

**Verification:**
```bash
pnpm run example:weather
curl localhost:3001/.well-known/agent.json
curl localhost:3001/health
pnpm run integration
```

> [!IMPORTANT]
> **This is the first externally demoable artifact.** The key proof is that one consumer can discover multiple providers, request forecasts in one format, and consume responses without bespoke integrations.

---

### Milestone 3 — Trust, Payments & Composition
**Goal:** Add the protocol features that make provider trust, payment, and multi-provider composition practical.

| # | Task | Purpose |
|---|---|---|
| [x] 3.1 | Implement `src/security/identity.ts` for DID generation, signing, and verification | Provider identity and provenance |
| [x] 3.2 | Integrate freshness fields (`nonce`, `timestamp`, `recipientDid`) into signed responses | Replay protection |
| [x] 3.3 | Write identity and replay-protection tests | Security verification |
| [x] 3.4 | Implement `PaymentProvider` interface + `X402PaymentProvider` | Paid forecast access |
| [x] 3.5 | Integrate `@x402/express` and `@x402/fetch` | Machine-native payments |
| [x] 3.6 | Implement `src/payments/negotiator.ts` for payment method matching | Consumer/provider compatibility |
| [x] 3.7 | Build `src/mcp/prediction-mcp-server.ts` exposing OPP-backed tools | MCP integration surface |
| [x] 3.8 | Implement `src/client/aggregator.ts` for fan-out and merge across providers | Multi-provider composition |
| [x] 3.9 | Implement `src/security/rate-limiter.ts` for per-agent limits and spending caps | Operational control |
| [x] 3.10 | Add SSE streaming (`tasks/sendSubscribe`) to server and client | Long-running request support |
| [x] 3.11 | Update examples to demonstrate signing, payment, and aggregation | Protocol ergonomics |

**Verification:**
```bash
pnpm test
# MCP Inspector shows OPP-backed tools
# Aggregation test queries multiple providers and merges the results
```

**Follow-up hardening for current M3 code:** complete

---

### Milestone 4 — Scoring Metadata, Observability & Production Hardening
**Goal:** Strengthen the protocol's trust layer and operational readiness without turning OPP into a forecasting engine.

| # | Task | Purpose |
|---|---|---|
| [x] 4.1 | Implement `src/observability/metrics.ts` for Brier scoring utilities and domain-scoped calibration metadata | Standardized evaluation evidence |
| [x] 4.2 | Implement prediction resolution flow (ground truth → score update → Agent Card refresh) | Calibration feedback loop |
| [x] 4.3 | Implement `src/observability/tracing.ts` with a lightweight tracing facade and span primitives | Protocol observability |
| [x] 4.4 | Implement `src/observability/logger.ts` with correlation IDs | Structured logs |
| [x] 4.5 | Implement `src/observability/golden-tasks.ts` for periodic known-answer checks | Operational trust monitoring |
| [x] 4.6 | Implement `src/observability/confidence-monitor.ts` for drift and deviation signals | Quality degradation detection |
| [x] 4.7 | Add circuit-breaker logic to reject degraded providers or route to fallback | Safer consumption |
| [x] 4.8 | Write scoring, calibration, and monitoring tests | Validation |
| [x] 4.9 | Configure `tsup` for dual ESM/CJS build + `src/index.ts` entry point | Packaging |
| [x] 4.10 | Final verification: typecheck + all tests + integration + build | Release readiness |

**Operational follow-up identified after M3 review:**

- Add abort-aware streaming so long-running `tasks/sendSubscribe` requests stop provider-side work promptly when clients disconnect.

**Verification:**
```bash
pnpm run typecheck && pnpm test && pnpm run integration && pnpm run build
```

---

### Milestone 5 — Advanced Verification, Privacy & Compliance
**Goal:** Complete the advanced protocol hooks for independent verification, sensitive requests, and regulated environments.

> [!NOTE]
> M5 is still protocol infrastructure. It adds stronger trust and governance capabilities, but it does not turn OPP into a separate service or marketplace application.

| # | Task | Purpose |
|---|---|---|
| [x] 5.1 | Design scorer role schema (`spec/scorer-agent-card.schema.json`) | Independent verification role |
| [x] 5.2 | Implement `src/scoring/ledger.ts` for append-only prediction records | Auditability foundation |
| [x] 5.3 | Implement `src/scoring/consensus.ts` for pluggable multi-source resolution logic | Stronger verification path |
| [x] 5.4 | Implement `src/security/query-privacy.ts` for blind or privacy-sensitive requests | Sensitive forecast support |
| [x] 5.5 | Implement `src/security/anomaly-detector.ts` for prediction poisoning signals | Abuse detection |
| [x] 5.6 | Implement `StripePaymentProvider` for fiat support | Broader payment compatibility |
| [x] 5.7 | Implement `src/compliance/filter.ts` for consumer-side compliance filtering | Deployment policy support |
| [x] 5.8 | Implement `src/compliance/audit-logger.ts` for structured audit events | Audit trail support |
| [x] 5.9 | Implement `src/compliance/oversight.ts` for override / stop decision helpers | Human oversight hooks |
| [x] 5.10 | Document compliance profiles for selected regulated domains | Deployment guidance |
| [x] 5.11 | Implement `src/client/conditional.ts` for conditional trigger subscriptions | Advanced composition |
| [x] 5.12 | Create `packages/create-opp-agent/` CLI scaffolding tool | Faster adoption |

---

### Milestone 6 — Runtime Trust & Security Hardening
**Goal:** Close the remaining security gaps on the reference consumer, transport, privacy, and error-handling paths so OPP is safer against malicious or confused providers and clearer about its security guarantees.

> [!NOTE]
> This milestone is the follow-up to the supplemental runtime trust-path review recorded in `spec/security-review.md`.

| # | Task | Purpose |
|---|---|---|
| [x] 6.1 | Bind JSON-RPC replies and prediction responses to the originating request across client transports, `PredictionClient`, aggregation, and MCP flows | Prevent replay and substituted results |
| [x] 6.2 | Enforce provider identity matching between discovered Agent Cards, response metadata, and verified signatures | Prevent cross-provider trust confusion |
| [x] 6.3 | Bind streaming lifecycle and terminal result events to the active request and reject malformed or mismatched streams | Safer long-running request consumption |
| [x] 6.4 | Add SSE and HTTP response size limits, frame limits, timeout handling, and abort hooks on consumer transports | Bound resource-exhaustion risk |
| [x] 6.5 | Sanitize default public error messages while preserving structured internal diagnostics for trusted deployments | Reduce information disclosure |
| [x] 6.6 | Replace or rename deterministic "blinded" hashing with a stronger privacy mode and explicit documentation of guarantees | Honest and stronger privacy semantics |
| [x] 6.7 | Expand conformance and regression tests for request binding, provider identity mismatches, malicious streams, and sanitized errors | Prevent security regressions |
| [x] 6.8 | Update protocol and implementer docs with runtime trust-path requirements and deployment caveats | Better security guidance |

**Verification:**
```bash
pnpm run typecheck && pnpm test && pnpm run build:all
# plus targeted trust-path, malicious-stream, and error-sanitization regression coverage
```

---

## Milestone Summary

```mermaid
gantt
    title OPP Implementation Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section M1 – Spec & Core
    Schema design and validation      :m1a, 2026-03-29, 3d
    Types and tests                   :m1b, after m1a, 2d
    Whitepaper and protocol framing   :m1c, after m1b, 2d

    section M2 – SDK & Providers
    PredictionAgent server            :m2a, after m1c, 3d
    PredictionClient and free payment :m2b, after m2a, 2d
    Proxy providers and integration   :m2c, after m2b, 3d
    README and onboarding             :m2d, after m2c, 1d

    section M3 – Trust & Composition
    DID and replay protection         :m3a, after m2d, 2d
    x402 and payment negotiation      :m3b, after m3a, 2d
    MCP and aggregation               :m3c, after m3a, 3d
    Rate limiting and streaming       :m3d, after m3b, 2d

    section M4 – Scoring & Operations
    Calibration metadata flow         :m4a, after m3d, 3d
    Tracing and logging               :m4b, after m4a, 2d
    Monitoring and circuit breakers   :m4c, after m4b, 2d
    Build and release prep            :m4d, after m4c, 1d

    section M5 – Advanced Protocol
    Scorer role and ledger            :m5a, after m4d, 4d
    Privacy and anomaly detection     :m5b, after m5a, 3d
    Compliance and fiat rails         :m5c, after m5b, 4d
    Conditional triggers and CLI      :m5d, after m5c, 2d

    section M6 – Security Hardening
    Request and provider binding      :m6a, after m5d, 3d
    Transport and stream limits       :m6b, after m6a, 2d
    Privacy and error hardening       :m6c, after m6b, 3d
    Docs and conformance updates      :m6d, after m6c, 2d
```

| Milestone | Focus | Est. Effort |
|---|---|---|
| **M1** | Schemas, types, validation, protocol framing | Complete |
| **M2** | Reference SDK and demo providers | Complete |
| **M3** | Identity, payments, MCP integration, aggregation | Complete, including identity, x402 payments, MCP tools, aggregation, rate limiting, SSE lifecycle streaming, and demo examples |
| **M4** | Calibration metadata, observability, production hardening | Complete |
| **M5** | Advanced verification, privacy, compliance, scaffolding | Complete, with privacy and trust-path follow-up hardening now tracked in M6 |
| **M6** | Runtime trust-path, transport, privacy, and error-surface hardening | In progress |

---

## Design Principles

1. **Protocol first.** OPP defines how agents exchange forecasts, not how forecasts are generated.
2. **Schema first, infrastructure later.** Optional fields for trust, payment, compliance, and composition appear early so the protocol surface can stabilize.
3. **Demoable at each step.** The roadmap prioritizes externally understandable demos, especially provider discovery, request/response interoperability, and multi-provider consumption.
4. **Trust strengthens in layers.** Early versions can expose provisional metadata; later versions add stronger independent verification paths.
5. **Composable by design.** OPP should support reusable upstream forecasts, dependency chains, aggregation, and private downstream composition.

---

## Public Launch Checklist

**Goal:** Prepare OPP for a public draft release as a credible protocol and reference SDK for the agentic economy.

> [!NOTE]
> This checklist is about launch and standardization readiness. It is separate from milestone feature work.

| # | Task | Purpose |
|---|---|---|
| [x] L1 | Remove `"private": true` from publishable packages and finalize package metadata | Enable real package distribution |
| [x] L2 | Add `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` | Establish public project trust and contribution flow |
| [x] L3 | Write a versioning and compatibility policy for schemas, wire methods, and SDK exports | Define what is stable vs experimental |
| [x] L4 | Separate normative protocol requirements from explanatory whitepaper guidance | Make the spec easier to implement independently |
| [x] L5 | Create a conformance test suite for independent OPP implementations | Support interoperability and standardization |
| [x] L6 | Add a protocol maturity statement to `README.md` (`draft`, `reference SDK`, stability expectations) | Set correct adopter expectations |
| [x] L7 | Run a security review of signing, payment negotiation, streaming, and public HTTP surfaces | Reduce launch risk |
| [x] L8 | Implement abort-aware SSE cancellation for disconnecting clients | Improve operational correctness for long-running streams |
| [x] L9 | Add implementer docs for building compatible providers and consumers without this SDK | Encourage independent implementations |
| [x] L10 | Demonstrate interoperability with at least one independent implementation | Validate standard viability |
| [x] L11 | Define lightweight project governance for protocol evolution and change approval | Reduce single-repo standard risk |
| [x] L12 | Add release automation and changelog discipline for public versioned releases | Improve reliability of public distribution |
