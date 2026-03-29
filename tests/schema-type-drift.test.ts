import { describe, expect, it } from "vitest";

import {
  validateAgentCard,
  validatePredictionRequest,
  validatePredictionResponse
} from "../src/schemas/index.js";
import type {
  AgentCard,
  PredictionRequest,
  PredictionResponse
} from "../src/types/index.js";

function expectSchemaValid<T>(validate: ((value: unknown) => boolean) & { errors?: unknown }, value: T): void {
  const valid = validate(value);
  expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

describe("schema and type drift guard", () => {
  it("accepts a maximally populated AgentCard typed fixture", () => {
    const fixture = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      description: "Domain-scoped weather forecasts",
      url: "https://provider.example.com",
      identity: {
        id: "provider-1",
        did: "did:key:z6Mkexample"
      },
      capabilities: {
        predictions: [
          {
            id: "weather.precipitation.daily",
            domain: "weather.precipitation",
            title: "Daily precipitation probability",
            description: "Probability of rainfall exceeding threshold",
            output: {
              type: "binary-probability",
              units: "probability"
            },
            horizons: ["24h", "72h"]
          }
        ]
      },
      pricing: {
        options: [
          {
            method: "x402",
            model: "per-request",
            currency: "USDC",
            amount: 0.05
          }
        ]
      },
      calibration: {
        domains: [
          {
            domain: "weather.precipitation",
            scoreType: "brier",
            score: 0.14,
            sampleSize: 128,
            verificationStatus: "verified",
            verifiedBy: ["did:key:z6Mkverifier"],
            coverage: {
              from: "2026-01-01T00:00:00Z",
              to: "2026-03-01T00:00:00Z"
            }
          }
        ]
      },
      compliance: {
        riskLevel: "limited",
        humanOversight: true
      }
    } satisfies AgentCard;

    expectSchemaValid(validateAgentCard, fixture);
  });

  it("accepts a maximally populated PredictionRequest typed fixture", () => {
    const fixture = {
      requestId: "req-typed-1",
      createdAt: "2026-03-28T12:00:00Z",
      consumer: {
        id: "consumer-1",
        did: "did:key:z6Mkconsumer"
      },
      prediction: {
        domain: "weather.precipitation",
        question: "Will rainfall exceed 10mm in Warsaw tomorrow?",
        horizon: "24h",
        desiredOutput: "binary-probability",
        resolution: "rainfall > 10mm by gauge reading",
        context: {
          location: "Warsaw",
          thresholdMm: 10
        }
      },
      constraints: {
        maxLatencyMs: 5_000,
        maxPrice: 0.1,
        minVerificationStatus: "provisional",
        compliance: {
          humanOversightRequired: false
        }
      },
      privacy: {
        mode: "plain"
      },
      payment: {
        preferredMethod: "x402"
      }
    } satisfies PredictionRequest;

    expectSchemaValid(validatePredictionRequest, fixture);
  });

  it("accepts completed and failed PredictionResponse typed fixtures", () => {
    const completedFixture = {
      responseId: "resp-completed-1",
      requestId: "req-typed-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1",
        did: "did:key:z6Mkprovider"
      },
      forecast: {
        type: "categorical-distribution",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        distribution: [
          {
            label: "rain",
            probability: 0.72
          },
          {
            label: "no-rain",
            probability: 0.28
          }
        ],
        rationale: "Based on blended numerical weather models"
      },
      freshness: {
        timestamp: "2026-03-28T12:01:00Z",
        nonce: "nonce-1",
        recipientDid: "did:key:z6Mkconsumer"
      },
      provenance: {
        dependencyChain: [
          {
            responseId: "upstream-1",
            domain: "weather.precipitation"
          }
        ]
      },
      signature: {
        alg: "Ed25519",
        value: "base58-signature"
      },
      audit: {
        modelVersion: "wx-2026.03"
      }
    } satisfies PredictionResponse;

    const failedFixture = {
      responseId: "resp-failed-1",
      requestId: "req-typed-1",
      status: "failed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      error: {
        code: "prediction_failed",
        message: "Upstream provider unavailable"
      }
    } satisfies PredictionResponse;

    expectSchemaValid(validatePredictionResponse, completedFixture);
    expectSchemaValid(validatePredictionResponse, failedFixture);
  });
});
