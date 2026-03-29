import { describe, expect, it } from "vitest";

import {
  evaluateProviderCircuitBreaker,
  selectProviderWithCircuitBreaker
} from "../src/observability/circuit-breaker.js";
import type {
  ConfidenceMonitorSignal,
  ConfidenceMonitorSignalResult
} from "../src/observability/confidence-monitor.js";
import type { AgentCard } from "../src/types/index.js";

describe("observability circuit breaker", () => {
  it("allows a provider when no degradation signals are present", () => {
    const decision = evaluateProviderCircuitBreaker({
      agentCard: createAgentCard("provider-1"),
      monitor: {
        status: "ok",
        signals: []
      }
    });

    expect(decision).toEqual({
      action: "allow",
      providerId: "provider-1",
      reasons: [],
      fallbackProviderId: undefined
    });
  });

  it("routes to fallback when degradation is present and fallback is configured", () => {
    const decision = evaluateProviderCircuitBreaker({
      agentCard: createAgentCard("provider-1"),
      monitor: {
        status: "degraded",
        signals: [
          createSignal("score-drift", "degraded", "brier drift exceeded threshold")
        ]
      },
      fallbackProvider: createAgentCard("provider-2")
    });

    expect(decision).toEqual({
      action: "fallback",
      providerId: "provider-1",
      fallbackProviderId: "provider-2",
      reasons: ["brier drift exceeded threshold"]
    });
  });

  it("rejects a degraded provider when no fallback is configured", () => {
    const decision = evaluateProviderCircuitBreaker({
      agentCard: createAgentCard("provider-1"),
      monitor: {
        status: "degraded",
        signals: [
          createSignal("score-drift", "degraded", "brier drift exceeded threshold")
        ]
      }
    });

    expect(decision).toEqual({
      action: "reject",
      providerId: "provider-1",
      fallbackProviderId: undefined,
      reasons: ["brier drift exceeded threshold"]
    });
  });

  it("can reject warn-level providers when configured with a strict threshold", () => {
    const decision = evaluateProviderCircuitBreaker({
      agentCard: createAgentCard("provider-1"),
      monitor: {
        status: "warn",
        signals: [
          createSignal("confidence-gap", "warn", "confidence gap exceeded threshold")
        ]
      },
      rejectOnStatus: "warn"
    });

    expect(decision.action).toBe("reject");
    expect(decision.reasons).toEqual(["confidence gap exceeded threshold"]);
  });

  it("selects the first allowed provider and skips degraded entries", () => {
    const selection = selectProviderWithCircuitBreaker({
      candidates: [
        {
          agentCard: createAgentCard("provider-1"),
          monitor: {
            status: "degraded",
            signals: [
              createSignal("score-drift", "degraded", "brier drift exceeded threshold")
            ]
          }
        },
        {
          agentCard: createAgentCard("provider-2"),
          monitor: {
            status: "ok",
            signals: []
          }
        }
      ]
    });

    expect(selection.selectedProviderId).toBe("provider-2");
    expect(selection.decisions).toEqual([
      {
        action: "reject",
        providerId: "provider-1",
        fallbackProviderId: undefined,
        reasons: ["brier drift exceeded threshold"]
      },
      {
        action: "allow",
        providerId: "provider-2",
        fallbackProviderId: undefined,
        reasons: []
      }
    ]);
  });

  it("can select an explicit fallback provider for a degraded candidate", () => {
    const selection = selectProviderWithCircuitBreaker({
      candidates: [
        {
          agentCard: createAgentCard("provider-1"),
          monitor: {
            status: "degraded",
            signals: [
              createSignal("score-drift", "degraded", "brier drift exceeded threshold")
            ]
          },
          fallbackProvider: createAgentCard("provider-2")
        }
      ]
    });

    expect(selection.selectedProviderId).toBe("provider-2");
    expect(selection.decisions).toEqual([
      {
        action: "fallback",
        providerId: "provider-1",
        fallbackProviderId: "provider-2",
        reasons: ["brier drift exceeded threshold"]
      }
    ]);
  });
});

function createAgentCard(id: string): AgentCard {
  return {
    protocolVersion: "0.1.0",
    name: id,
    url: `https://${id}.example.com`,
    identity: {
      id
    },
    capabilities: {
      predictions: [
        {
          id: `${id}.weather.precipitation`,
          domain: "weather.precipitation",
          title: "Daily precipitation probability",
          output: {
            type: "binary-probability"
          },
          horizons: ["24h"]
        }
      ]
    }
  };
}

function createSignal(
  kind: ConfidenceMonitorSignal["kind"],
  severity: ConfidenceMonitorSignal["severity"],
  message: string
): ConfidenceMonitorSignal {
  return {
    kind,
    severity,
    message,
    value: 1,
    threshold: 0.5
  };
}
