# Security Policy

## Supported Versions

Until OPP reaches `1.0.0`, only the latest `0.x` release is considered supported for security fixes.

After `1.0.0`, security support will follow the latest stable minor line unless otherwise noted in release notes.

## Reporting a Vulnerability

Please do not open public issues for suspected security vulnerabilities.

Report security issues privately to the project maintainers with:

- a description of the issue
- affected files, APIs, or protocol flows
- reproduction steps or a proof of concept
- impact assessment if known

If the report is valid, the project will aim to:

1. acknowledge receipt promptly
2. reproduce and assess impact
3. prepare a fix or mitigation
4. publish a coordinated disclosure note after a patch is available

## Scope

Security-relevant areas currently include:

- signature generation and verification
- payment negotiation and authorization helpers
- HTTP and SSE transport handling
- schema validation and trust metadata processing
- compliance and oversight control surfaces

## Disclosure Expectations

Please avoid:

- public disclosure before a fix or mitigation exists
- automated scanning or denial-of-service activity against public demos
- sharing exploit details more broadly than necessary during coordinated remediation
