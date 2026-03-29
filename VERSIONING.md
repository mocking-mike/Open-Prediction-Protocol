# Versioning and Compatibility Policy

## Current Status

OPP is currently a draft protocol and reference SDK in the `0.x` phase.

This means:

- the protocol is public and usable
- the schemas and SDK are intended to converge toward stability
- breaking changes are still allowed when necessary

## Compatibility Layers

OPP has three compatibility surfaces:

1. JSON Schemas in [spec/](./spec)
2. wire-level behavior such as HTTP routes, JSON-RPC methods, and SSE lifecycle semantics
3. TypeScript SDK exports in [src/](./src)

## `0.x` Policy

Before `1.0.0`:

- breaking changes may occur in any layer
- every intentional breaking change should be documented in the roadmap, release notes, or both
- changes to schemas or wire semantics should also be reflected in the whitepaper or spec documentation as needed
- optional features may be added without being treated as breaking changes

## What Counts As Breaking

Examples of breaking changes include:

- removing or renaming schema fields
- changing required vs optional schema fields
- changing JSON-RPC method names or request/response semantics
- changing SSE event semantics in incompatible ways
- removing exported SDK APIs without replacement

Examples that are usually non-breaking:

- adding new optional schema fields
- adding new optional helper APIs
- adding new docs, examples, or internal modules
- improving validation strictness for values already forbidden by the documented schema

## `1.0.0` Goal

The project should not claim `1.0.0` until all of the following are true:

- the core schemas are intended to remain stable
- the wire protocol is documented in normative form
- conformance expectations exist for independent implementations
- at least one independent interoperability path has been demonstrated

## Experimental Features

Features may be described as experimental when they are:

- optional
- recently introduced
- likely to change before `1.0.0`

Experimental status should be stated explicitly in documentation when relevant.
