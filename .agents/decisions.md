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

### DEC-018 — Streaming uses SSE lifecycle events with an unchanged terminal response schema
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement long-running request support as a separate JSON-RPC method, `tasks/sendSubscribe`, that returns `text/event-stream` and emits `submitted` and `working` lifecycle events followed by one terminal `result` event containing the normal `PredictionResponse`.
- **Why:** This adds progress streaming without introducing partial-result response variants or changing the canonical OPP request/response schemas.
- **Alternatives rejected:** Extending `PredictionResponse` with non-terminal states, Creating a separate partial-result schema for v0.1, Replacing the existing `predictions.request` request/response path

### DEC-019 — Schema/type drift guard uses typed fixtures validated against canonical schemas
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Guard schema/type drift with tests that build maximally populated TypeScript fixtures and validate them against the canonical JSON Schemas, rather than introducing code generation at this stage.
- **Why:** This catches common divergence in fields, enums, and optionality with low maintenance cost while preserving the schema-first source of truth.
- **Alternatives rejected:** Full schema-to-TypeScript generation pipeline, No explicit drift guard beyond existing schema tests

### DEC-020 — MCP request-schema hardening uses stricter Zod validation plus parity tests
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Keep the MCP tool input schema in Zod for SDK compatibility, but tighten it to mirror the canonical OPP request contract and enforce parity with the canonical runtime validator through dedicated tests.
- **Why:** This removes the highest-risk drift path in the MCP surface without introducing a schema-conversion layer into the current codebase.
- **Alternatives rejected:** Leaving MCP input validation looser than OPP, Adding an immediate schema-generation pipeline for MCP inputs

### DEC-021 — Signature payload canonicalization uses RFC 8785-style JSON key ordering
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Standardize signature payload generation on an RFC 8785-style canonical JSON serializer that removes `undefined` fields, preserves array order, and sorts object keys by UTF-16 code unit order before signing.
- **Why:** This makes signatures stable across object construction order and avoids locale-sensitive key ordering in the trust layer.
- **Alternatives rejected:** Keeping locale-based key sorting, Signing raw `JSON.stringify` output, Deferring canonicalization hardening

### DEC-022 — Runtime validators enforce declared `uri` and `date-time` schema formats
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Treat `uri` and `date-time` schema formats as real runtime validation constraints in the exported Ajv validators and schema tests, rather than documentation-only hints.
- **Why:** Core protocol fields such as provider URLs and request timestamps should not pass runtime validation when they violate the canonical schema contract.
- **Alternatives rejected:** Leaving format checks disabled at runtime, Deferring format enforcement until a later build or code-generation step

### DEC-023 — M4 scoring starts with binary Brier/log utilities and calibration-update helpers
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement the first observability layer as lightweight binary scoring utilities plus domain-calibration snapshot/update helpers, without introducing a full resolution ledger or scorer workflow yet.
- **Why:** This delivers the roadmap’s first production trust primitive while keeping M4 focused on reusable protocol infrastructure rather than prematurely coupling it to M5 verification systems.
- **Alternatives rejected:** Deferring all scoring until the later resolution flow, Embedding calibration-update logic ad hoc inside clients or examples

### DEC-024 — M4 resolution flow resolves completed binary responses into calibration updates
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement the first resolution flow as a thin observability layer that accepts completed binary prediction responses plus ground-truth outcome, derives one binary observation, and refreshes the matching Agent Card calibration entry.
- **Why:** This delivers the roadmap’s calibration feedback loop now while keeping non-binary resolution, ledgers, and consensus scoring for later milestones.
- **Alternatives rejected:** Coupling resolution directly into the metrics module, Deferring all resolution flow until M5 scorer infrastructure

### DEC-025 — Development workflow requires slice reviews and milestone-entry consistency reviews
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Require a focused code review after each implementation slice and a broader whitepaper/roadmap/decision-log consistency review before each new milestone begins.
- **Why:** This keeps protocol claims, roadmap status, and implementation quality aligned while reducing silent drift between documentation and code.
- **Alternatives rejected:** Ad hoc review timing, Deferring consistency review until release time

### DEC-026 — M4 tracing starts with a lightweight tracer facade and in-memory exporter
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement the first tracing layer as a dependency-free tracer/span abstraction with an in-memory exporter and `withSpan` helper, instead of introducing OpenTelemetry SDK wiring immediately.
- **Why:** This creates a stable protocol-level tracing surface now while keeping future OpenTelemetry integration open and avoiding premature dependency complexity.
- **Alternatives rejected:** Pulling in full OpenTelemetry instrumentation immediately, Deferring all tracing until later M4 tasks

### DEC-029 — M4 logging starts with a lightweight structured logger and correlation IDs
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement structured logging as a dependency-free logger abstraction with pluggable sinks, child-context support, and generated correlation IDs, rather than adopting a specific logging backend immediately.
- **Why:** This gives the protocol a reusable structured logging surface now while preserving flexibility for later sink and transport integrations.
- **Alternatives rejected:** Binding the SDK to one logging library, Deferring structured logging until after broader observability work

### DEC-030 — M4 golden-task monitoring starts as evaluation helpers over resolved binary responses
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement golden-task monitoring as a lightweight observability module that evaluates completed binary responses against known-answer task definitions, updates calibration through the existing resolution flow, and summarizes recent evaluation outcomes.
- **Why:** This adds operational trust checks now without coupling M4 to a scheduler, persistent monitor state, or broader verification infrastructure that belongs in later milestones.
- **Alternatives rejected:** Building a full golden-task runner and scheduler immediately, Embedding known-answer checks ad hoc inside examples or external ops code

### DEC-031 — M4 confidence monitoring summarizes evaluation history and emits threshold-based signals
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement confidence monitoring as a dependency-free snapshot-and-signals module over golden-task evaluation history, using explicit thresholds for confidence-gap and score-drift warnings rather than background monitoring infrastructure.
- **Why:** This gives the protocol a concrete degradation-detection surface now while preserving flexibility for later schedulers, persistence, and policy enforcement.
- **Alternatives rejected:** Building a full monitoring service inside the SDK, Deferring all drift detection until circuit breakers or external ops tooling

### DEC-032 — M4 circuit breakers start as a pure provider-routing policy over monitor status
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement circuit-breaking as a dependency-free policy module that consumes confidence-monitor status and returns explicit `allow`, `fallback`, or `reject` decisions, without wiring it directly into transport or client selection logic yet.
- **Why:** This delivers the safety decision surface now while keeping integration strategy open for later routing layers and production policies.
- **Alternatives rejected:** Embedding breaker logic directly inside transports or aggregators immediately, Deferring provider degradation handling until after packaging

### DEC-033 — Packaging uses tsup dual-format builds with bundled canonical schemas
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Package the SDK with `tsup` from `src/index.ts`, emit both ESM and CJS entry points plus declarations, and import the canonical JSON schemas directly so validation works from bundled artifacts without runtime filesystem path assumptions.
- **Why:** This makes the package portable across build targets and avoids CJS/`import.meta` breakage in the schema validator layer.
- **Alternatives rejected:** Publishing source-only TypeScript, Keeping filesystem-based schema loading inside bundled output, Shipping only one module format

### DEC-034 — Independent scorers use a dedicated Agent Card schema with scoring capabilities
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Model independent scorers with a dedicated `scorer-agent-card` schema that preserves the core OPP identity, pricing, and compliance structure while replacing provider prediction capabilities with scorer-specific capability declarations for domains, forecast types, score types, and verification modes.
- **Why:** This keeps scorer discovery compatible with the broader OPP trust model without overloading provider prediction capabilities or inventing a separate identity and metadata format.
- **Alternatives rejected:** Reusing provider `agent-card` unchanged for scorers, Deferring scorer-role schema design until ledger or consensus code exists

### DEC-035 — Scoring ledger starts as an in-memory append-only hash chain
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement the first prediction ledger as an append-only in-memory sequence of request, response, and resolution records with chained hashes and integrity verification, rather than introducing persistence or distributed coordination immediately.
- **Why:** This establishes an auditable scoring foundation now while keeping storage, replication, and consensus concerns separate for later milestones.
- **Alternatives rejected:** Deferring all ledger work until persistent storage is designed, Building a database-backed or networked ledger inside the SDK immediately

### DEC-036 — Consensus starts as pluggable binary outcome aggregation over scorer submissions
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement consensus as a lightweight helper that resolves one binary outcome from multiple scorer submissions using explicit `majority` and `weighted` strategies, with strict target-matching and duplicate-scorer rejection.
- **Why:** This provides the first stronger verification path now while keeping non-binary consensus, persistence, and network coordination outside the initial M5 surface.
- **Alternatives rejected:** Hard-coding one voting strategy, Coupling consensus directly into the ledger or observability modules, Deferring all consensus logic until a full scorer service exists

### DEC-037 — Query privacy starts with deterministic request blinding and reveal verification
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement privacy-sensitive request support as deterministic blinding helpers that redact sensitive request fields, preserve selected public context keys, and attach stable hash commitments so later reveal workflows can verify the original content without changing the base request schema.
- **Why:** This adds a practical privacy hook now while avoiding premature cryptographic protocol complexity or schema churn.
- **Alternatives rejected:** Deferring all query privacy until a heavier cryptographic design exists, Adding a separate blinded-request schema immediately, Encrypting request content inside the SDK without a larger key-management design

### DEC-038 — Anomaly detection starts as threshold-based security signals over OPP-visible metadata
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement prediction anomaly detection as a lightweight signal layer over consensus agreement, freshness metadata, recipient binding, and confidence-monitor degradation rather than attempting broader behavioral or model-level abuse detection immediately.
- **Why:** This gives OPP a practical first abuse-detection surface using protocol-visible evidence while keeping heavier threat modeling and statistical defenses for later evolution.
- **Alternatives rejected:** Deferring anomaly detection entirely, Building a full provider-behavior anomaly system inside the SDK immediately, Coupling anomaly detection directly into circuit breakers without a reusable signal layer

### DEC-039 — Stripe support uses the existing payment-provider abstraction, not direct SDK integration
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement `StripePaymentProvider` as a lightweight adapter over the existing `PaymentProvider` interface that delegates authorization to provider-controlled Stripe workflow code, rather than embedding live Stripe SDK operations into OPP itself.
- **Why:** This gives OPP protocol-level Stripe compatibility while keeping real account configuration, checkout/session orchestration, and webhook handling on the provider side where they belong.
- **Alternatives rejected:** Embedding direct Stripe API integration into the SDK, Deferring Stripe compatibility entirely until a larger billing subsystem exists

### DEC-040 — Compliance filtering starts as consumer-side checks over declared Agent Card metadata
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement compliance filtering as a lightweight consumer-side helper that evaluates provider-declared `riskLevel` and `humanOversight` metadata against request requirements and deployment policy thresholds, without attempting legal rule encoding or provider enforcement logic.
- **Why:** This gives deployments a practical policy-screening surface now while keeping compliance responsibility correctly outside the protocol library.
- **Alternatives rejected:** Deferring compliance filtering until broader audit tooling exists, Embedding hard-coded regulatory rules into OPP, Enforcing compliance checks only inside transport or server layers

### DEC-041 — Compliance audit logging starts as structured in-memory event capture
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement compliance audit logging as a lightweight in-memory event log with stable fields, query helpers, and summary views rather than introducing persistence, retention policy, or external reporting integrations immediately.
- **Why:** This establishes a usable audit-trail surface now while keeping storage and operational governance concerns separate from the SDK core.
- **Alternatives rejected:** Deferring audit logging until later compliance work, Reusing the general observability logger as the only audit surface, Building a persistent audit store inside the SDK immediately

### DEC-042 — Oversight starts as local review, override, and stop state helpers
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement human-oversight hooks as a lightweight local controller that evaluates when review is required and records `allowed`, `requires-review`, `overridden`, and `stopped` decisions, rather than building transport-level stop endpoints or workflow orchestration immediately.
- **Why:** This gives OPP a usable oversight decision surface now while keeping endpoint wiring and operational workflow integration open for later deployments.
- **Alternatives rejected:** Deferring all oversight support until a server control plane exists, Embedding oversight state directly into the agent runtime without a reusable helper

### DEC-043 — Compliance profiles are documented as deployment guidance over existing protocol controls
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Document selected regulated-domain compliance profiles as deployment guidance mapped onto existing OPP controls such as `riskLevel`, `humanOversightRequired`, audit logging, oversight decisions, anomaly detection, and consensus, rather than introducing new compliance schema fields.
- **Why:** This gives adopters concrete policy guidance now while keeping the protocol surface stable and avoiding premature jurisdiction-specific modeling.
- **Alternatives rejected:** Deferring compliance guidance until later, Adding new protocol fields for each profile, Encoding legal requirements directly into the SDK

### DEC-044 — Conditional triggers start as client-side subscriptions over completed binary forecasts
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement conditional trigger subscriptions as a lightweight client-side registry that watches completed binary forecast responses and materializes follow-up `PredictionRequest`s when configured probability thresholds are crossed.
- **Why:** This delivers the first advanced composition primitive now without introducing a persistent subscription service or changing the base request/response protocol.
- **Alternatives rejected:** Deferring conditional composition entirely, Building a server-side subscription runtime immediately, Expanding the core protocol schema before the first reference behavior exists

### DEC-045 — Agent scaffolding starts as a minimal package generator with static templates
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement `packages/create-opp-agent/` as a small CLI and library that generates a starter OPP agent package from static templates, instead of building an interactive template engine or framework-specific scaffolder.
- **Why:** This gives adopters a fast, testable bootstrap path now while keeping the scaffolding surface easy to maintain and aligned with the reference SDK.
- **Alternatives rejected:** Deferring scaffolding entirely, Building a larger interactive generator immediately, Generating multiple framework variants before the first package exists

### DEC-046 — Public launch starts with draft-stability policy and publishable package boundaries
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Prepare the first public launch by making the root SDK and `create-opp-agent` scaffold package buildable as publishable packages, and add explicit draft-stability, contribution, conduct, and security documentation before broader standardization work.
- **Why:** This makes the repository credible as a public draft protocol project now without pretending that governance, conformance, and interoperability proof are already complete.
- **Alternatives rejected:** Keeping packages private until all launch checklist items are complete, Publishing code without explicit draft-stability or contribution expectations, Treating launch readiness as only a code-quality question

### DEC-047 — Public protocol guidance is split into normative spec and informative whitepaper
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Add a dedicated normative protocol document in `spec/protocol.md` that defines the interoperable HTTP, JSON-RPC, schema, and lifecycle contract, while leaving `whitepaper.md` as explanatory and non-normative.
- **Why:** Independent implementers need a concise contract document that is easier to follow than a vision-oriented whitepaper and less fragmented than reading only schemas and examples.
- **Alternatives rejected:** Treating the whitepaper as partially normative, Leaving the protocol contract scattered across schemas and README sections, Deferring normative consolidation until after public launch

### DEC-048 — Conformance starts as a black-box HTTP provider runner over the minimal surface
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement the first conformance suite as a reusable black-box runner that validates the minimal HTTP provider surface against the normative OPP schemas, JSON-RPC methods, and SSE lifecycle behavior.
- **Why:** This gives independent implementations a concrete interoperability target now without coupling conformance to internal unit tests or requiring the full reference SDK runtime.
- **Alternatives rejected:** Treating the existing repo test suite as sufficient conformance, Deferring conformance until multiple external implementations exist, Expanding first-pass conformance to every optional subsystem immediately

### DEC-049 — Payment authorization is request-bound and signature verification is strict about declared algorithms
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Bind paid authorization hooks to the full prediction request, including provider-specific `payment.authorization` context, and reject unsupported `signature.alg` values before verifying signed responses.
- **Why:** Public launch should not present paid rails or signed envelopes as trustworthy if authorization is detached from request proof or if verification silently ignores declared algorithm metadata.
- **Alternatives rejected:** Leaving payment authorization option-only, Treating payment proof handling as purely out-of-band, Ignoring `signature.alg` and trusting the DID key path alone

### DEC-050 — Independent implementers get provider and consumer guides separate from the SDK
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Add dedicated provider and consumer implementation guides in `spec/` that explain how to speak OPP over the normative wire contract without depending on the reference SDK.
- **Why:** A protocol cannot credibly aim for standard adoption if the only practical path is to read SDK internals or copy example code.
- **Alternatives rejected:** Leaving implementation guidance implicit in the README and examples, Deferring implementer docs until external adopters ask for them, Expanding the whitepaper instead of adding practical guides

### DEC-051 — Draft-phase governance is explicit, lightweight, and tied to normative documents
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Define a lightweight governance model in `GOVERNANCE.md` that distinguishes editorial, implementation, and protocol changes, requires explicit maintainer approval for protocol-affecting changes, and treats the normative spec, schemas, versioning policy, and decisions log as the current source of truth.
- **Why:** Public draft protocols need an explicit change path and source-of-truth hierarchy before they can credibly ask other teams to build against them.
- **Alternatives rejected:** Leaving governance implicit in maintainer discretion alone, Deferring governance until after independent interoperability exists, Pretending the project already has a formal standards body

### DEC-052 — Draft releases require changelog entries, package packing, and CI verification
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Add a draft-phase release process with `CHANGELOG.md`, `RELEASE.md`, package-packing automation, and a CI workflow that runs release verification and package artifact creation on public branches.
- **Why:** Public protocol projects need a repeatable release path and inspectable package outputs before outside adopters can trust versioned releases.
- **Alternatives rejected:** Relying on ad hoc manual publish steps, Deferring changelog discipline until after `1.0.0`, Treating build success alone as sufficient release automation

### DEC-053 — Streaming cancellation is propagated through handler abort signals
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Implement abort-aware SSE cancellation by propagating an `AbortSignal` from the HTTP streaming connection into `PredictionAgent.streamRequest(...)`, `PredictionAgent.handleRequest(...)`, and the provider handler itself, and stop streaming silently on external cancellation instead of emitting a failed terminal response.
- **Why:** Client disconnects should stop provider-side work promptly, and external cancellation should not be reported as an application-level prediction failure.
- **Alternatives rejected:** Aborting only the socket without changing handler APIs, Converting disconnects into failed prediction responses, Leaving streaming cancellation as an operational note only

### DEC-054 — First interoperability proof targets a standalone provider outside the SDK runtime
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Demonstrate initial interoperability by validating the conformance runner against a standalone HTTP provider implementation that does not use `PredictionAgent` or `PredictionHttpServer`, while keeping it in the same repository for repeatable verification.
- **Why:** This proves that OPP compatibility is not limited to the reference runtime and gives the project a practical bridge toward future external implementations.
- **Alternatives rejected:** Treating the reference SDK server as sufficient interoperability proof, Waiting for a separate external repository before documenting any proof, Building a second implementation that still reuses the core runtime paths

### DEC-027 — Review findings must be fixed or explicitly roadmap-tracked
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Treat correctness-critical, protocol-breaking, security-relevant, and regression-prone review findings as immediate fixes, and require non-immediate findings to be added to `roadmap.md`.
- **Why:** This prevents important review findings from being acknowledged without changing either the code or the execution plan.
- **Alternatives rejected:** Leaving review findings in chat only, Relying on ad hoc follow-up after reviews

### DEC-028 — Slice reviews must be fully dispositioned before work continues
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Do not proceed to the next implementation slice until each review finding is fixed, explicitly rejected with rationale, or recorded in `roadmap.md`.
- **Why:** This forces review outcomes into a complete, auditable state instead of allowing unresolved findings to accumulate between slices.
- **Alternatives rejected:** Implicit review follow-up, Carrying unresolved findings informally into later work

### DEC-055 — Runtime trust-path binding is request-first and Agent Card-aware
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Make `PredictionClient` always bind responses and stream events to the active request, and bind provider identity to an Agent Card only when the caller supplies validated Agent Card metadata for that runtime path.
- **Why:** Request binding is mandatory for safe default consumption, while provider-identity binding should be enforced wherever the consumer actually has discovered provider metadata without making bare transport fixtures or bootstrap callers invent Agent Cards.
- **Alternatives rejected:** Trusting schema-valid responses alone, Forcing provider identity checks even when no Agent Card context exists

### DEC-056 — Reference consumer transports default to bounded bodies, bounded SSE events, and abort-aware timeouts
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Add transport-level response size caps, per-event SSE size caps, default request and stream-idle timeouts, and caller-provided abort-signal support to the reference HTTP and x402 consumer transports.
- **Why:** The reference client path should fail safely against stalled or malicious providers by default instead of relying on every integrator to remember to wrap fetches and streams with their own guards.
- **Alternatives rejected:** Leaving transport reads unbounded, Requiring callers to configure all safety guards explicitly, Using only a total-stream cap instead of per-event bounds plus idle timeout

### DEC-057 — Public provider errors are sanitized by default with explicit diagnostic escape hatches
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Make `PredictionAgent` failed responses and `PredictionHttpServer` JSON-RPC errors use category-safe default messages, while exposing raw details only through explicit `exposeErrorDetails` options and structured `errorReporter` hooks.
- **Why:** The reference runtime should not leak vendor, configuration, validation, or rate-limit internals by default, but trusted deployments still need a supported path to capture or intentionally expose diagnostics.
- **Alternatives rejected:** Keeping raw exception strings as the default, Adding new protocol fields for internal diagnostics, Removing access to raw diagnostics entirely

### DEC-058 — Query privacy uses committed requests with local reveal secrets instead of public "blinded" hashes
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Replace the canonical `privacy.mode = "blinded"` path with `privacy.mode = "committed"`, structured `privacy.commitment` metadata, and a query-privacy helper that returns both the redacted request and a local reveal secret for later verification.
- **Why:** The old deterministic public-hash helper was linkable and overstated its guarantees, while per-request HMAC commitments make repeated requests unlinkable by default and describe the trust model more honestly.
- **Alternatives rejected:** Keeping deterministic hashes and only renaming them, Using public salted hashes without a local reveal secret, Deferring privacy hardening to deployment-specific wrappers

### DEC-059 — HTTP conformance treats binding and malformed-stream invariants as errors and sanitized invalid-request errors as warnings
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Expand `runHttpProviderConformance(...)` so request/provider binding and stream-shape checks are error-level failures, while default invalid-request error sanitization is covered as warning-level security guidance.
- **Why:** Binding and stream cardinality are core interoperability invariants, but public error sanitization is a strong default for the reference surface rather than a wire-level requirement every implementation must adopt identically.
- **Alternatives rejected:** Leaving the new security hardening out of conformance entirely, Making sanitized error strings an error-level interoperability requirement, Treating request/provider binding as warnings only

### DEC-060 — Protocol docs make request binding normative and transport hardening advisory
- **Date:** 2026-03-29
- **Status:** accepted
- **Choice:** Document response and stream request-binding invariants as normative protocol requirements, while keeping transport limits, default public-error sanitization, and other deployment hardening measures as implementer guidance unless already enforced by schemas or conformance errors.
- **Why:** Request and stream binding are necessary for interoperable correctness across independent implementations, but transport thresholds and public error wording are safer as strong defaults and deployment guidance rather than frozen wire-level requirements in `v0.1.0`.
- **Alternatives rejected:** Keeping the binding rules only in runtime code and tests, Promoting all reference hardening defaults to protocol MUSTs immediately, Leaving the docs ambiguous about which security behaviors are interoperability requirements
