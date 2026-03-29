# Contributing

## Ground Rules

- Keep changes aligned with the protocol-first scope of OPP.
- Do not introduce breaking schema or wire-level changes without updating the roadmap, whitepaper or spec as appropriate, and the decisions log.
- Follow the repository workflow in [.agents/rules.md](./.agents/rules.md), including review and decision logging requirements.
- Follow [GOVERNANCE.md](./GOVERNANCE.md) for protocol-affecting changes.

## Development Setup

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build:all
```

## Change Expectations

For non-trivial changes:

- update relevant tests
- update `roadmap.md` when status or follow-up work changes
- log architectural decisions in `.agents/decisions.md` when the change affects structure, protocol shape, or long-term maintenance
- keep docs coherent with implementation

## Pull Request Guidance

A good contribution should include:

- a clear statement of the problem
- the chosen approach and notable tradeoffs
- test coverage or a justification for why tests were not added
- documentation updates when public behavior changes

## Protocol Stability

OPP is currently a draft `0.x` protocol and reference SDK.

That means:

- breaking changes are still possible
- new optional capabilities may be added
- compatibility-sensitive changes should be called out explicitly

## Code of Conduct

By participating in this project, you agree to follow the rules in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
