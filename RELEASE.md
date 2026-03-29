# Release Process

This document describes the draft-phase release process for OPP.

## Goals

Each public release should:

- pass typecheck
- pass tests
- build all published packages
- produce inspectable package tarballs
- record notable changes in [CHANGELOG.md](./CHANGELOG.md)

## Release Checklist

1. update versions where needed
2. update [CHANGELOG.md](./CHANGELOG.md)
3. run:

```bash
pnpm run release:check
pnpm run release:pack
```

4. inspect the generated tarballs in `.release/`
5. confirm the normative spec, roadmap, and decisions log are coherent
6. tag and publish using your preferred registry workflow

## Current Release Commands

```bash
pnpm run release:check
pnpm run release:pack
```

`release:check` runs the draft release verification flow.

`release:pack` creates package tarballs for:

- `open-prediction-protocol`
- `create-opp-agent`

## Draft-Phase Note

Until `1.0.0`, releases may still contain intentional breaking changes.

When that happens:

- call them out clearly in [CHANGELOG.md](./CHANGELOG.md)
- update [VERSIONING.md](./VERSIONING.md) if policy assumptions change
- update normative docs when schemas or wire semantics change
