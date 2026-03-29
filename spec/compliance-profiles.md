# OPP Compliance Profiles

Deployment-oriented guidance for using the current OPP compliance, oversight, and audit surfaces in selected regulated or high-impact domains.

This document is not legal advice. It does not make an OPP deployment compliant by itself. It shows how the current protocol hooks can support stricter deployment policies.

## Current OPP Controls

The current protocol surface includes:

- provider-declared `AgentCard.compliance.riskLevel`
- provider-declared `AgentCard.compliance.humanOversight`
- consumer-declared `PredictionRequest.constraints.compliance.humanOversightRequired`
- consumer-side provider screening via `src/compliance/filter.ts`
- audit-trail capture via `src/compliance/audit-logger.ts`
- review / override / stop decisions via `src/compliance/oversight.ts`
- trust hardening via signatures, freshness, consensus, anomaly detection, and calibration metadata

These profiles use only those controls.

## Profile 1: Internal Operational Planning

Example use cases:

- inventory planning
- staffing forecasts
- internal logistics support

Suggested baseline:

- maximum accepted provider `riskLevel`: `limited`
- `humanOversightRequired`: `false`
- calibration metadata: recommended
- audit logging: recommended
- consensus scoring: optional
- anomaly detection: recommended

Rationale:

- these workflows may influence business operations, but they usually do not justify the heaviest review path if a deployment remains internal and decision support is not fully automated

## Profile 2: Financial Decision Support

Example use cases:

- treasury planning
- pricing support
- refinancing or rate outlook support

Suggested baseline:

- maximum accepted provider `riskLevel`: `limited`
- `humanOversightRequired`: `true`
- calibration metadata: required when available
- audit logging: required
- consensus scoring: recommended for higher-impact workflows
- anomaly detection: required
- override / stop controls: required

Rationale:

- financial recommendations can create material downstream effects, so providers should be screened conservatively and outputs should remain under human review

## Profile 3: Health or Safety Support

Example use cases:

- care navigation support
- operational emergency planning
- risk forecasting that may influence high-impact decisions

Suggested baseline:

- maximum accepted provider `riskLevel`: `high`
- `humanOversightRequired`: `true`
- calibration metadata: required
- audit logging: required
- consensus scoring: required for sensitive deployments
- anomaly detection: required
- override / stop controls: required
- blinded requests: recommended when prompts contain sensitive operational or personal context

Rationale:

- these deployments may legitimately involve providers that self-declare higher risk, but they should never bypass oversight, auditability, and stronger verification

## Profile 4: External Consumer-Facing Automation

Example use cases:

- automated recommendation routing
- high-volume public-facing forecast-driven actions

Suggested baseline:

- maximum accepted provider `riskLevel`: `limited`
- `humanOversightRequired`: `true` for any materially consequential workflow
- calibration metadata: required
- audit logging: required
- consensus scoring: recommended
- anomaly detection: required
- override / stop controls: required

Rationale:

- public-facing automation increases operational and reputational risk, even outside traditionally regulated sectors

## How To Apply A Profile

1. Set request-side `humanOversightRequired` when the profile requires review.
2. Filter providers with `src/compliance/filter.ts` using the profile's maximum acceptable `riskLevel`.
3. Record decision and routing events with `src/compliance/audit-logger.ts`.
4. Use `src/compliance/oversight.ts` when requests require review, override, or stop decisions.
5. Combine anomaly detection, consensus, and calibration metadata for higher-impact deployments.

## Non-Goals

These profiles do not define:

- jurisdiction-specific legal compliance
- provider certification or licensing requirements
- retention periods
- breach reporting workflows
- model governance beyond the protocol hooks OPP currently exposes
