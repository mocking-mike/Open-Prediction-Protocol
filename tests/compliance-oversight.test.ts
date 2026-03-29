import { describe, expect, it } from "vitest";

import {
  InMemoryOversightController,
  evaluateOversightRequirement
} from "../src/compliance/oversight.js";
import type { AgentCard, PredictionRequest } from "../src/types/index.js";

describe("compliance oversight", () => {
  it("requires review when the request demands oversight and the provider does not declare it", () => {
    const decision = evaluateOversightRequirement({
      request: createRequest(true),
      agentCard: createProvider(false)
    });

    expect(decision).toEqual({
      status: "requires-review",
      requestId: "req-oversight-1",
      reasons: ["Request requires human oversight but provider does not declare support"]
    });
  });

  it("allows the request when oversight requirements are satisfied", () => {
    const decision = evaluateOversightRequirement({
      request: createRequest(true),
      agentCard: createProvider(true)
    });

    expect(decision).toEqual({
      status: "allowed",
      requestId: "req-oversight-1",
      reasons: []
    });
  });

  it("tracks override and stop decisions in memory", () => {
    const controller = new InMemoryOversightController();

    const initial = controller.recordReview({
      requestId: "req-oversight-1",
      status: "requires-review",
      reasons: ["Manual review required"]
    });
    const override = controller.override({
      requestId: "req-oversight-1",
      actor: "operator-1",
      reason: "Approved after inspection"
    });
    const stopped = controller.stop({
      requestId: "req-oversight-2",
      actor: "operator-2",
      reason: "Escalated compliance concern"
    });

    expect(initial.status).toBe("requires-review");
    expect(override).toEqual({
      requestId: "req-oversight-1",
      status: "overridden",
      actor: "operator-1",
      reason: "Approved after inspection"
    });
    expect(stopped).toEqual({
      requestId: "req-oversight-2",
      status: "stopped",
      actor: "operator-2",
      reason: "Escalated compliance concern"
    });
    expect(controller.getDecision("req-oversight-1")).toEqual({
      requestId: "req-oversight-1",
      status: "overridden",
      actor: "operator-1",
      reason: "Approved after inspection"
    });
    expect(controller.getDecision("req-oversight-2")).toEqual({
      requestId: "req-oversight-2",
      status: "stopped",
      actor: "operator-2",
      reason: "Escalated compliance concern"
    });
  });
});

function createRequest(humanOversightRequired: boolean): PredictionRequest {
  return {
    requestId: "req-oversight-1",
    createdAt: "2026-03-29T19:00:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Will rainfall exceed 10mm?",
      horizon: "24h",
      desiredOutput: "binary-probability"
    },
    constraints: {
      compliance: {
        humanOversightRequired
      }
    }
  };
}

function createProvider(humanOversight: boolean): AgentCard {
  return {
    protocolVersion: "0.1.0",
    name: "provider-1",
    url: "https://provider-1.example.com",
    identity: {
      id: "provider-1"
    },
    capabilities: {
      predictions: [
        {
          id: "provider-1.weather.precipitation",
          domain: "weather.precipitation",
          title: "Daily precipitation probability",
          output: {
            type: "binary-probability"
          },
          horizons: ["24h"]
        }
      ]
    },
    compliance: {
      riskLevel: "limited",
      humanOversight
    }
  };
}
