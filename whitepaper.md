# Open Prediction Protocol (OPP)
## Reference Whitepaper v0.2

An open protocol for AI agents to discover prediction providers, request probabilistic forecasts, receive structured responses, compare trust metadata, and pay for results. Built on agentic economy primitives such as A2A, MCP, DID, and x402, OPP makes prediction a portable capability between agents.

---

## 1. Motivation

Prediction is a recurring need in intelligent agent systems. A logistics agent may need weather probabilities, a treasury agent may need an FX forecast, and a planning agent may need a demand estimate.

Today, these workflows usually require bespoke integrations. Every agent team must decide:

1. Which provider can answer this question?
2. What exactly can that provider predict?
3. How should the request be formatted?
4. What structure will the response use?
5. Why should the result be trusted?
6. How should payment be handled?

OPP standardizes those concerns by defining:

1. **Capability Advertisement**: How providers describe forecast domains, horizons, and pricing via an extended Agent Card.
2. **Standardized Delivery**: How requests and responses move through a structured lifecycle.
3. **Trust Metadata**: How identity, provenance, freshness, and calibration signals are represented.
4. **Payment Abstraction**: How providers advertise supported payment methods, including free tiers and paid rails.
5. **Composition Primitives**: How predictions can be chained, aggregated, and reused across agent workflows.

---

## 2. Scope

OPP is the interoperability layer for trusted prediction exchange between agents.

Its first-version value is practical:

- fewer custom forecast integrations
- easier provider switching
- reusable multi-provider routing and aggregation
- machine-readable trust signals
- payment handling as part of the protocol contract

### 2.1 What OPP Is

OPP is:

- a wire protocol for agent-to-agent forecast exchange
- a schema for discovery, request, response, trust metadata, and payment metadata
- a foundation that lets agents buy predictions from external providers in a standard way

### 2.2 What OPP Is Not

OPP is not:

- a forecasting engine
- a demand-aggregation service
- a human forecasting platform
- a full prediction marketplace application

OPP exists to standardize agent-to-agent forecast exchange.

---

## 3. Unique Value Proposition

**OPP makes prediction procurement interoperable in the agentic economy.**

| Approach | Limitation OPP solves |
|---|---|
| **Closed prediction APIs** | Each provider requires a custom integration, custom trust evaluation, and a separate billing relationship. |
| **Raw LLM prompting** | No standardized provenance, calibration, or provider comparison layer. |
| **Custom agent pipelines** | Forecast access stays brittle and provider-specific. Swapping vendors or combining providers requires repeated glue code. |
| **Generic agent protocols alone** | Agent messaging standards are necessary infrastructure, but they do not define prediction-specific trust, payment, or composition semantics. |

**OPP's differentiation:**

1. **Prediction-specific interoperability**: OPP focuses on the discovery and exchange of probabilistic forecasts, not generic tasks.
2. **Trust-aware procurement**: Providers expose machine-readable identity, freshness, provenance, and calibration metadata.
3. **Composable forecasts**: Consumers can chain and aggregate forecasts without inventing a new contract for each provider.
4. **Payment-aware exchange**: Free and paid providers can advertise supported methods in one protocol.
5. **Engine-agnostic design**: OPP does not assume how a provider generated the forecast.

---

## 4. Human-Benefit Use Cases

Humans may never interact with OPP directly. They benefit when their agents can buy better forecast inputs more reliably.

Examples:

- **Personal finance**: an assistant compares mortgage-rate or macroeconomic forecast providers before grounding a refinancing recommendation.
- **Inventory planning**: a planning agent buys demand or weather-linked forecasts from external specialists instead of relying on a single internal heuristic.
- **Travel and logistics**: an agent queries weather and transport-related providers in parallel, then routes the result into its own optimization logic.
- **Education support**: a tutoring workflow consumes specialized performance forecasts from providers calibrated on similar learner populations.

The protocol does not make the final decision. It standardizes how forecast inputs are sourced and compared.

---

## 5. Protocol Architecture & Roles

OPP defines how agents communicate about predictions. It does not prescribe how predictions are generated.

### 5.1 Consumer Agents

Consumer agents discover providers, evaluate trust metadata, submit prediction requests, and consume the response.

### 5.2 Provider Agents

Provider agents receive prediction requests, generate or retrieve forecasts using their own internal systems, sign or annotate the result, and return it in OPP format.

### 5.3 Independent Scorers

OPP reserves a role for independent scorers that can verify outcomes and publish calibration evidence.

In early deployments, calibration metadata may be provisional or self-declared. Over time, independent verification can strengthen the trust layer without changing the wire protocol.

### 5.4 End-to-End Flow

1. **Discover**: A consumer reads a provider's Agent Card and filters by domain, horizon, pricing, and trust metadata.
2. **Request**: The consumer sends a structured prediction request.
3. **Deliver**: The provider returns a structured probabilistic response, optionally signed and freshness-bound.
4. **Compose**: The consumer may aggregate or chain the result with other forecasts.
5. **Score**: When ground truth becomes available, calibration evidence may be updated and exposed to future consumers.

---

## 6. Trust Model

Trust in OPP is represented as metadata carried through the protocol. That includes:

- **Identity**: who provided this forecast
- **Freshness**: when it was generated and for whom
- **Provenance**: whether it depends on other forecasts or upstream inputs
- **Calibration metadata**: what evidence exists about this provider's historical performance in this domain

### 6.1 Domain-Scoped Calibration

Trust must be domain-specific.

A provider with strong evidence in `weather.precipitation` should not automatically be trusted for `finance.forex`.

For that reason, OPP models calibration per domain and includes supporting context such as:

- score type
- sample size
- coverage period
- verification status

### 6.2 Independent Verification

Self-reported scores are useful for bootstrapping, but they are not sufficient as a long-term trust mechanism.

OPP therefore supports independently verified scoring metadata. The protocol does not require a single scorer network design up front, but it does make room for:

- external verification of calibration claims
- later append-only logging or resolution systems
- stronger auditing of outcome-based trust signals

### 6.3 Proper Scoring Rules

OPP is designed to carry calibration data derived from proper scoring rules such as:

- **Brier Score**
- **Log Score**

The protocol itself does not mandate one forecasting method. It standardizes how evaluation evidence is expressed.

---

## 7. Prediction Composition

Prediction procurement becomes more useful when forecasts are composable.

OPP is designed to support three important composition patterns:

1. **Dependency Chains**: one forecast may explicitly depend on another upstream forecast.
2. **Aggregation**: a consumer may query multiple providers and merge the results.
3. **Conditional Triggers**: consumers may express follow-on prediction requests triggered by prior forecast outputs, and later implementations may extend that to resolved outcomes.

This matters for both reusability and privacy.

A shared upstream forecast can be reused in multiple downstream private chains. For example, one agent may use a regional weather forecast for crop prediction while another uses the same upstream forecast for traffic or logistics planning.

---

## 8. Security & Operational Safeguards

OPP defines security-relevant metadata and lifecycle expectations for agent-to-agent prediction exchange:

1. **Identity and Replay Protection**: freshness bounds, nonces, and recipient binding reduce replay risk.
2. **Rate Limits and Spending Caps**: consumers and providers can express operational constraints that reduce runaway fan-out or spend.
3. **Optional Query Privacy**: the protocol can carry privacy preferences for sensitive requests.
4. **Operational Anomaly Signals**: later implementations may publish signals related to suspicious behavior or trust degradation.

These safeguards should be implemented in layers. The protocol carries the necessary hooks even when not every deployment implements every control from day one.

---

## 9. Compliance Metadata

In regulated settings, agents may need to express or filter on operational and compliance constraints.

OPP supports protocol-level metadata for concerns such as:

- provider-declared risk classifications
- human-oversight requirements
- audit-oriented response fields

OPP does not, by itself, make a deployment compliant with any regulation. It standardizes the metadata needed for systems that must operate under external compliance regimes.

---

## 10. Conclusion

OPP is a protocol for discovering, buying, receiving, comparing, and composing probabilistic forecasts between agents.

Its value comes from standardization:

- one discovery model
- one request and response contract
- one place for trust metadata
- one way to express composability and payment support

By keeping the scope narrow, OPP can become the shared protocol layer for trustworthy prediction exchange without prescribing how forecasts are generated or how downstream applications are built.
