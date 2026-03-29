---
name: Agentic Economy Best Practices
description: Comprehensive reference for architecting, securing, and operating autonomous AI agent systems in the agentic economy — covering architecture patterns, communication protocols (A2A, MCP), security & identity, monetization, EU AI Act compliance, and observability.
---

# Agentic Economy Best Practices

This skill provides a structured knowledge base for building production-grade software in the **agentic economy** — an ecosystem where autonomous AI agents act as primary software consumers, performing perception, reasoning, and independent action on behalf of humans.

Use this skill when designing, reviewing, or advising on systems that involve autonomous agents, agent-to-agent communication, or AI-driven workflows.

---

## 1. Definitional Landscape

**"Agenticness" is a spectrum, not a binary state.** A system becomes more agentic as its ability to plan across multiple steps and adapt to dynamic challenges increases.

### Core Characteristics of Agentic AI

| Characteristic | Description |
|---|---|
| **Autonomy** | Operates with limited or no human supervision |
| **Reasoning** | Draws from rules-based logic AND probabilistic models |
| **Planning** | Decomposes complex goals into multi-step action plans |
| **Memory** | Maintains persistent state across interactions |

### Key Insight for Developers

The focus must shift from writing static code to defining the **"mission"** and **"boundaries"** of the agent. Establish clear outcomes and KPIs at each deployment phase. A model reclaiming 20% of a worker's time ≠ 20% labor-cost saving — the value lies in higher-quality decisions or increased operational scale.

---

## 2. Architectural Patterns

See also: [architecture_patterns.md](../../resources/architecture_patterns.md)

### Single-Agent Reasoning Loops

| Pattern | Mechanism | Trade-off |
|---|---|---|
| **ReAct** (Reason & Act) | Analyze → identify gaps → execute tool → observe → repeat | Clear audit trail; higher token cost |
| **Planning-Based** | Decompose into full plan upfront, then execute | Fewer LLM calls (3-4 vs 5-7 in ReAct) |
| **Reflection** | Generate draft → switch to "critic" mode → evaluate against criteria | 2-3× token cost vs single-pass |
| **Reflexion** | Reflection + external evaluation signals for iterative refinement | Highest quality; highest cost |

### Multi-Agent Coordination

| Pattern | Mechanism | Best Use Case |
|---|---|---|
| **Orchestrator-Worker** | Central supervisor routes sub-tasks to specialized workers | General enterprise task management |
| **Sequential Workflow** | Agents chained; each builds on previous output | Predictable multi-step data pipelines |
| **Hierarchical Teams** | Multiple supervisors manage specialized agent clusters | Complex multi-domain projects |
| **Parallel Workflows** | Independent tasks handled simultaneously, merged at end | High-volume independent processing |
| **Collaborative Swarms** | Distributed reasoning; agents negotiate resource allocation | Real-time supply chain/market optimization |

### Anti-Pattern: The Silo Effect

Agents clashing instead of collaborating. Mitigate with:
- **Shared data layer** across all agents
- **Explicit coordination** via state machines or orchestrators
- **Small, distributed agents** for transparency and fault isolation

> **Rule of thumb:** Single agents degrade from ~60% to ~25% accuracy over consecutive runs on complex tasks. Switch to multi-agent when task complexity demands it.

---

## 3. Memory Architecture

Production agents need a **multi-tiered memory system**:

| Tier | Implementation | Purpose |
|---|---|---|
| **Short-term** | Scratchpad / context window | Track current goals and intermediate results |
| **Long-term** | Vector storage with semantic search | Historical context across past interactions |
| **Entity/External** | Structured fact store | Users, tools, environmental constraints |
| **Execution Checkpoints** | State snapshots | Resume operations after failures/timeouts |

### Memory Best Practices

- Implement **decay and size limits** to prevent memory bottleneck
- Store **structured facts**, not raw text
- Rebuild context from **specific IDs**, not ad-hoc data dumps
- Force **state checkpointing** at maximum context windows to prevent instruction forgetting

---

## 4. Communication Protocols

See also: [protocols_reference.md](../../resources/protocols_reference.md)

### A2A Protocol (Agent-to-Agent)

The **A2A protocol** (Google / Linux Foundation) is the "HTTP of agents" — standardizing how agents from different vendors collaborate.

**Core element:** The **Agent Card** — a JSON metadata document at `/.well-known/agent.json` advertising identity, endpoints, modalities, and auth requirements.

| Component | Format | Function |
|---|---|---|
| Agent Card | JSON-LD / JSON Schema | Discovery & capability matching |
| Task | Structured JSON Object | Unit of work with lifecycle |
| Message | JSON-RPC 2.0 Payload | Instructions, context, status |
| Artifact | Incremental Streamed Data | Tangible output (document, image) |

**Key property:** Agents are **"opaque"** — they collaborate without revealing internal logic, prompts, or tools. This preserves IP.

### MCP (Model Context Protocol)

MCP bridges AI models to their tools and data sources via a standardized, bidirectional connection.

| Role | Description |
|---|---|
| **MCP Host** | AI application/environment (IDE, desktop assistant) |
| **MCP Client** | Module translating requests into protocol format |
| **MCP Server** | External service exposing tools and resources to the LLM |

**Benefit:** Reduces hallucinations by providing direct access to real-time data sources.

**Caveat:** MCP can add abstraction layers that complicate reasoning. For **mission-critical steps**, prefer direct function calls.

---

## 5. Security & Identity

See also: [security_checklist.md](../../resources/security_checklist.md)

### Decentralized Identity (DID + Verifiable Credentials)

Every agent should have a self-controlled digital identity:

| Component | Role | Benefit |
|---|---|---|
| **DID Document** | Ledger-anchored identifier → proves key ownership | No PII; decentralized control |
| **Digital Signature** | Cryptographic seal of authenticity | Tamper-proof; verifiable offline |
| **Selective Disclosure** | Prove attributes without revealing underlying data | Data minimization |
| **Zero-Knowledge Proofs** | Proof of truth without data exposure | Privacy in multi-agent workflows |

### Prompt Injection Defense (OWASP #1 LLM Vulnerability)

Implement **layered defense**:

1. **Identity-Aware Enforcement** — Treat every agent as distinct IAM identity; use OAuth 2.0 with scoped permissions
2. **Credential Injection Middleware** — Short-lived tokens (1-2h rotation), injected only after validating intended action; never store credentials in agent memory
3. **Deterministic Runtime Policy** — Hard limits the LLM cannot bypass (e.g., block purchases > $500; block external emails after suspicious data access)
4. **Adversarial Testing** — Red-team exercises and chaos engineering to simulate prompt injection before production

### Hardware-Level Security

| Technology | Scope | Best Use |
|---|---|---|
| **HSM** | Cryptographic keys only | Key storage; payment processing |
| **TEE** (AMD SEV, Intel TDX) | Entire VMs | Protecting models/datasets in cloud |
| **Enclave** (Intel SGX) | Small application functions | PII handling; signing inference results |

Use a **layered architecture**: HSM for root keys → TEE for AI workload encryption → Enclave for sensitive operations.

---

## 6. Monetization & Financial Rails

### The x402 Protocol

HTTP-native payment standard for agent-to-service micropayments:

1. Agent requests a monetized resource
2. Server returns **HTTP 402** with payment metadata (amount, currency, destination)
3. Agent signs payment (stablecoin wallet, e.g., USDC) and retries with payment signature in header

**Eliminates:** manual account creation, API key management, subscription prepayment.

### Billing Models

| Model | Mechanism | Best For |
|---|---|---|
| **Usage-Based** | Per token / API call / GPU cycle | Guaranteed margins; auditable revenue |
| **Outcome-Based** | Charge per result (booked meeting, resolved ticket) | Trust-building; incentive alignment |
| **Value-Based** | % of ROI generated | High-value agent deployments |
| **Flex Credits** | Prepaid consumption units | Predictable spending across departments |

### Platforms

| Platform | Focus | Settlement |
|---|---|---|
| Nevermined | Agent-to-agent financial rails | Instant (Crypto + Fiat) |
| Skyfire | Agent wallet abstraction | Real-time (Crypto) |
| Paid.ai | AI cost tracking & margin analytics | Fiat-first |
| Orb | Usage-based billing for SaaS | 1-2 weeks (Fiat) |
| Stripe | Traditional payments + AI extensions | 2-4 weeks (Fiat) |

---

## 7. EU AI Act Compliance

See also: [compliance_guide.md](../../resources/compliance_guide.md)

### High-Risk Classification

A system is high-risk if it performs **safety-critical functions** or impacts **fundamental rights** (e.g., autonomous vehicle steering, credit applications).

**Provider obligations:**
- Risk management & quality management system (full lifecycle)
- Training/test data: relevant, representative, error/bias-free
- Technical documentation + meticulous activity logs
- EU/national database registration + conformity assessment

### GPAI & Systemic Risk

Models trained with >10²⁵ FLOPs face additional requirements:
- Standardized model evaluations
- Adversarial testing
- Serious incident reporting to AI Office

### Human Oversight (Article 14)

High-risk systems must enable overseers to:
- ✅ Fully understand system capacities and limitations
- ✅ Avoid automation bias
- ✅ Disregard, override, or reverse agent output
- ✅ Intervene or stop operation via "stop" button

> For biometric identification systems: actions must be verified by **at least two** competent individuals.

---

## 8. Observability & Error Handling

### Agentic Observability Metrics

| Category | What to Measure | Goal |
|---|---|---|
| **Performance** | Task completion accuracy; correct results within timeframes | Utility & correctness |
| **Cost** | Token usage; resource efficiency vs output | Budgetary control |
| **Reliability** | Consistency under varying conditions; behavioral predictability | Trust & stability |
| **Compliance** | Decision traceability; guardrail adherence | Governance & legal safety |

### Non-Deterministic Failure Handling

1. **Dynamic Confidence Thresholds** — Flag for review if confidence deviates >2σ from historical averages
2. **Context Drift Monitoring** — Track context tokens consumed; force state checkpointing at max context windows
3. **Handoff Validation** — JSON schema validation at every agent-to-agent stage
4. **Circuit Breaker** — Route through backup validation or human review on suspicious upstream output
5. **Golden Tasks** — Repeatable test harnesses with known answers; track success across model versions

> **Design for determinism where possible** (direct tool calls for critical steps) and **test variability where unavoidable.**

---

## 9. Strategic Framework

### 6-Step Enterprise Checklist

1. **Define Clarity Before Complexity** — Frame agent goal as specific outcome tied to business metric (e.g., "reduce SOC false positives by 50%")
2. **Architecture Fit Before Flash** — Choose frameworks by orchestration needs; ensure cross-system interoperability from day one
3. **Mission-Critical Data Integration** — 80% of agentic AI work is data engineering. Break silos; enforce data lineage governance
4. **Autonomy Needs Guardrails** — RBAC, audit logs, explainability from the start. Security is a prerequisite for autonomy
5. **Evaluate Beyond Accuracy** — Measure behavioral consistency, response time, reasoning quality (multi-dimensional evaluation)
6. **Continuous Refinement** — Agents are not set-and-forget. Establish feedback loops; monitor for drift and edge cases

### Framework Comparison

| Framework | Strength | Best For |
|---|---|---|
| **LangGraph** | Stateful, deterministic, graph-based execution | Complex pipelines with branching logic |
| **CrewAI** | Role-based collaboration with shared context | Specialized agent "crews" |
| **AutoGen** | Multi-agent messaging and negotiation | Research-oriented setups |
| **Akka** | Scalable, high-performance runtime | Enterprise-scale production |
| **GraphBit** | Rust-powered, deterministic execution | High-volume, extreme consistency |
