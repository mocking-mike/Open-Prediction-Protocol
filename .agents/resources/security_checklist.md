# Security Checklist for Agentic Systems

Actionable checklist for securing autonomous AI agent deployments.

---

## 1. Agent Identity

- [ ] Every agent has a **Decentralized Identifier (DID)** — ledger-anchored, self-controlled
- [ ] Each agent carries **Verifiable Credentials (VCs)** issued by a trusted entity
- [ ] Chain-of-trust verification links every agent to a verified human owner
- [ ] DID Documents point to authentication means (no PII stored)
- [ ] Digital signatures provide tamper-proof, offline-verifiable authentication

---

## 2. Prompt Injection Defense

> **OWASP #1 vulnerability for LLM applications**

- [ ] **Identity-Aware Enforcement** — Every agent is a distinct IAM identity
- [ ] **OAuth 2.0 scoped permissions** — Agent access limited strictly to required resources
- [ ] **Input sanitization** — Filter and validate all external inputs before agent processing
- [ ] **System prompt isolation** — Prevent user/external inputs from overriding system instructions
- [ ] **Output validation** — Verify agent outputs conform to expected formats/ranges before execution

---

## 3. Credential Management

- [ ] **Credential Injection Middleware** deployed — no long-lived credentials in agent memory
- [ ] **Token rotation** — Short-lived tokens with 1-2 hour rotation
- [ ] **Action validation** — Tokens injected only after validating agent's intended action
- [ ] **No credential storage** in context/memory (extractable via prompt manipulation)

---

## 4. Deterministic Runtime Policy

- [ ] **Hard spending limits** (e.g., block purchases > $500)
- [ ] **Action blocklists** — Prevent specific actions after suspicious data access
- [ ] **Rate limiting** — Cap agent actions per time period
- [ ] **Scope boundaries** — Agents cannot access resources outside their defined domain

---

## 5. Adversarial Testing

- [ ] **Red-team exercises** — Simulate agent compromise and prompt injection
- [ ] **Chaos engineering** — Test failure modes before production
- [ ] **Jailbreak testing** — Attempt "ignore previous instructions" attacks
- [ ] **Data exfiltration testing** — Verify agents cannot leak sensitive data
- [ ] **Cascading failure testing** — Verify multi-agent workflows handle compromised agents

---

## 6. Hardware Security

### HSM (Hardware Security Module)
- [ ] Root encryption keys stored in HSM
- [ ] Centralized key management
- [ ] Automated key rotation (every 90-365 days)
- [ ] RBAC for key operations

### TEE (Trusted Execution Environment)
- [ ] AI model and dataset encryption during training/inference
- [ ] AMD SEV or Intel TDX for VM-level isolation
- [ ] Attestation reports generated and verified

### Enclave (Intel SGX)
- [ ] PII handling in enclave-isolated functions
- [ ] Inference result signing in enclave
- [ ] Cryptographic operations isolated from main runtime

---

## 7. Privacy & Data Minimization

- [ ] **Selective Disclosure** — Prove attributes without revealing underlying data
- [ ] **Zero-Knowledge Proofs** — Enable proof of truth without data exposure
- [ ] **Data retention policies** — Automated cleanup of agent memory/logs
- [ ] **Data classification** — Label all data by sensitivity level before agent access

---

## 8. Layered Defense Architecture

```
┌─────────────────────────────────────┐
│         Enclave (Intel SGX)         │  ← PII, signing, attestation
├─────────────────────────────────────┤
│      TEE (AMD SEV / Intel TDX)      │  ← Full AI workload encryption
├─────────────────────────────────────┤
│          HSM (Root Keys)            │  ← Key management, rotation
├─────────────────────────────────────┤
│    Deterministic Runtime Policy     │  ← Hard limits LLM can't bypass
├─────────────────────────────────────┤
│   Credential Injection Middleware   │  ← Short-lived tokens
├─────────────────────────────────────┤
│      IAM + OAuth 2.0 (Scoped)      │  ← Identity-aware enforcement
└─────────────────────────────────────┘
```

> **Goal:** Make attacks **mathematically infeasible**, not just policy-prohibited.
