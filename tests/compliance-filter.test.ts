import { describe, expect, it } from "vitest";

import {
  filterProvidersByCompliance,
  evaluateProviderCompliance
} from "../src/compliance/filter.js";
import type { AgentCard, PredictionRequest } from "../src/types/index.js";

describe("compliance filter", () => {
  it("accepts providers that satisfy consumer compliance requirements", () => {
    const provider = createProvider({
      riskLevel: "limited",
      humanOversight: true
    });
    const request = createRequest({
      compliance: {
        humanOversightRequired: true
      }
    });

    const decision = evaluateProviderCompliance({
      agentCard: provider,
      request
    });

    expect(decision).toEqual({
      allowed: true,
      providerId: "provider-1",
      reasons: []
    });
  });

  it("rejects providers missing required human oversight", () => {
    const provider = createProvider({
      riskLevel: "limited",
      humanOversight: false
    });
    const request = createRequest({
      compliance: {
        humanOversightRequired: true
      }
    });

    const decision = evaluateProviderCompliance({
      agentCard: provider,
      request
    });

    expect(decision).toEqual({
      allowed: false,
      providerId: "provider-1",
      reasons: ["Provider does not declare required human oversight support"]
    });
  });

  it("rejects providers above the configured maximum risk level", () => {
    const provider = createProvider({
      riskLevel: "high",
      humanOversight: true
    });

    const decision = evaluateProviderCompliance({
      agentCard: provider,
      maxRiskLevel: "limited"
    });

    expect(decision).toEqual({
      allowed: false,
      providerId: "provider-1",
      reasons: ["Provider risk level high exceeds allowed maximum limited"]
    });
  });

  it("filters multiple providers and returns only compliant entries", () => {
    const result = filterProvidersByCompliance({
      providers: [
        createProvider({
          id: "provider-1",
          riskLevel: "minimal",
          humanOversight: false
        }),
        createProvider({
          id: "provider-2",
          riskLevel: "high",
          humanOversight: true
        })
      ],
      request: createRequest({
        compliance: {
          humanOversightRequired: false
        }
      }),
      maxRiskLevel: "limited"
    });

    expect(result.allowedProviders.map((provider) => provider.identity?.id ?? provider.name)).toEqual([
      "provider-1"
    ]);
    expect(result.decisions).toEqual([
      {
        allowed: true,
        providerId: "provider-1",
        reasons: []
      },
      {
        allowed: false,
        providerId: "provider-2",
        reasons: ["Provider risk level high exceeds allowed maximum limited"]
      }
    ]);
  });
});

function createProvider(
  options: {
    id?: string;
    riskLevel?: AgentCard["compliance"] extends infer T
      ? T extends { riskLevel?: infer R } ? R : never
      : never;
    humanOversight?: boolean;
  } = {}
): AgentCard {
  const id = options.id ?? "provider-1";
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
    },
    compliance: {
      ...(options.riskLevel ? { riskLevel: options.riskLevel } : {}),
      ...(options.humanOversight !== undefined
        ? { humanOversight: options.humanOversight }
        : {})
    }
  };
}

function createRequest(
  compliance: PredictionRequest["constraints"] = {}
): PredictionRequest {
  return {
    requestId: "req-compliance-1",
    createdAt: "2026-03-29T18:30:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Will rainfall exceed 10mm?",
      horizon: "24h",
      desiredOutput: "binary-probability"
    },
    constraints: compliance
  };
}
