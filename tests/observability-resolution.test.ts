import { describe, expect, it } from "vitest";

import {
  createBinaryResolutionObservation,
  resolvePredictionOutcome
} from "../src/observability/resolution.js";
import type { AgentCard, PredictionResponse } from "../src/types/index.js";

describe("observability resolution", () => {
  it("creates a binary resolution observation from a completed binary response", () => {
    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      forecast: {
        type: "binary-probability",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        probability: 0.8
      }
    };

    const observation = createBinaryResolutionObservation(response, {
      outcome: true,
      resolvedAt: "2026-03-29T00:00:00Z"
    });

    expect(observation).toEqual({
      probability: 0.8,
      outcome: true,
      resolvedAt: "2026-03-29T00:00:00Z"
    });
  });

  it("updates agent-card calibration from a resolved completed prediction", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      identity: {
        id: "provider-1"
      },
      capabilities: {
        predictions: [
          {
            id: "weather.precipitation.daily",
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

    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      forecast: {
        type: "binary-probability",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        probability: 0.8
      }
    };

    const resolution = resolvePredictionOutcome({
      agentCard,
      response,
      outcome: true,
      resolvedAt: "2026-03-29T00:00:00Z",
      verificationStatus: "verified",
      verifiedBy: ["did:key:z6Mkverifier"]
    });

    expect(resolution.domain).toBe("weather.precipitation");
    expect(resolution.scoreType).toBe("brier");
    expect(resolution.observation).toEqual({
      probability: 0.8,
      outcome: true,
      resolvedAt: "2026-03-29T00:00:00Z"
    });
    expect(resolution.updatedAgentCard.calibration?.domains[0]?.score).toBeCloseTo(0.04, 10);
    expect(resolution.updatedAgentCard.calibration?.domains[0]?.verificationStatus).toBe("verified");
    expect(resolution.updatedAgentCard.calibration?.domains[0]?.verifiedBy).toEqual([
      "did:key:z6Mkverifier"
    ]);
  });

  it("rejects failed responses in the resolution flow", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      capabilities: {
        predictions: [
          {
            id: "weather.precipitation.daily",
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

    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "failed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      error: {
        code: "prediction_failed",
        message: "upstream unavailable"
      }
    };

    expect(() =>
      resolvePredictionOutcome({
        agentCard,
        response,
        outcome: true,
        resolvedAt: "2026-03-29T00:00:00Z"
      })
    ).toThrow("Only completed prediction responses can be resolved");
  });

  it("rejects non-binary forecasts in the resolution flow", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      capabilities: {
        predictions: [
          {
            id: "weather.precipitation.daily",
            domain: "weather.precipitation",
            title: "Daily precipitation probability",
            output: {
              type: "categorical-distribution"
            },
            horizons: ["24h"]
          }
        ]
      }
    };

    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      forecast: {
        type: "categorical-distribution",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        distribution: [
          {
            label: "rain",
            probability: 0.8
          },
          {
            label: "no-rain",
            probability: 0.2
          }
        ]
      }
    };

    expect(() =>
      resolvePredictionOutcome({
        agentCard,
        response,
        outcome: true,
        resolvedAt: "2026-03-29T00:00:00Z"
      })
    ).toThrow("Resolution flow currently supports only completed binary-probability forecasts");
  });

  it("rejects resolution when the response provider does not match the agent card", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      identity: {
        id: "weather-provider"
      },
      capabilities: {
        predictions: [
          {
            id: "weather.precipitation.daily",
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

    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "other-provider"
      },
      forecast: {
        type: "binary-probability",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        probability: 0.8
      }
    };

    expect(() =>
      resolvePredictionOutcome({
        agentCard,
        response,
        outcome: true,
        resolvedAt: "2026-03-29T00:00:00Z"
      })
    ).toThrow("Prediction response provider does not match AgentCard identity: other-provider");
  });
});
