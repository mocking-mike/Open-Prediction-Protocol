---
description: Checklist for evaluating schema changes in the Open Prediction Protocol
---

# Schema Change Checklist

Use this checklist before introducing or modifying protocol fields.

## Purpose

- Is this field solving a real protocol problem?
- Is the field needed for interoperability, or only for one implementation?
- Can the same goal be achieved with a simpler structure?

## Scope

- Is the field protocol-level rather than engine-level or application-level?
- Does it belong in OPP rather than a provider's internal logic?
- Does it avoid introducing marketplace or forecasting-engine concerns?

## Optionality

- Should this be required in all payloads, or optional for bootstrap deployments?
- If optional, is the absence of the field still semantically clear?
- If required, are we sure it will not block early adoption unnecessarily?

## Validation

- Can the field be validated mechanically?
- Are valid and invalid values easy to specify in tests?
- Does the field require additional constraints on sibling fields?

## Compatibility

- Is the change additive?
- Will existing implementations break?
- Would a more extensible representation avoid future schema churn?

## Trust and Semantics

- Does the field interact with identity, provenance, calibration, or payment metadata?
- Could the field accidentally imply stronger guarantees than the implementation supports?
- If the field is trust-relevant, does it distinguish provisional vs verified states where needed?

## Composition

- Does the field work with chained predictions and upstream dependencies?
- Does it preserve reuse of shared upstream forecast artifacts?
- Could it leak unnecessary private downstream information?

## Decision Logging

- Is this change important enough to log in `.agents/decisions.md`?
- If yes, has the rationale and rejected alternative been captured clearly?
