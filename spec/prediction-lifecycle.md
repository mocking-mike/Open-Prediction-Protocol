# Prediction Lifecycle

This document defines the v0.1 lifecycle for OPP prediction requests.

The lifecycle is intentionally minimal. It should be strict enough for interoperable client and provider behavior without introducing unnecessary orchestration complexity.

## States

### `submitted`

The request has been accepted by the provider-facing system but has not started active processing yet.

### `working`

The provider is actively processing the prediction request.

### `completed`

The request finished successfully and a prediction response is available.

### `failed`

The request finished unsuccessfully and an error response is available.

## Allowed Transitions

```text
submitted -> working
submitted -> failed
working -> completed
working -> failed
```

No other transitions are valid in v0.1.

In particular:

- `completed` is terminal
- `failed` is terminal
- `submitted -> completed` is not valid
- `completed -> working` is not valid
- `failed -> working` is not valid

## State Machine

```text
submitted
  ├─> working
  │    ├─> completed
  │    └─> failed
  └─> failed
```

## Semantics

- Providers may move directly from `submitted` to `failed` if validation or execution preconditions fail.
- Providers should move to `working` once active processing starts.
- Providers must return a structured prediction response when entering `completed`.
- Providers must return a structured error payload when entering `failed`.

## Notes

- v0.1 does not define `input-required`, `cancelled`, or streaming partial-result states.
- Additional states may be introduced later if they provide protocol-level interoperability value.
