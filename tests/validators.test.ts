import { describe, expect, it } from "vitest";

import {
  assertValidAgentCard,
  assertValidPredictionRequest,
  assertValidPredictionResponse,
  formatValidationErrors,
  validateAgentCard,
  validatePredictionRequest,
  validatePredictionResponse
} from "../src/schemas/index.js";

describe("schema validators", () => {
  it("validates an agent card through the exported validator", () => {
    const value = {
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

    expect(validateAgentCard(value), formatValidationErrors(validateAgentCard.errors).join("\n")).toBe(true);
    expect(() => assertValidAgentCard(value)).not.toThrow();
  });

  it("validates a request through the exported validator", () => {
    const value = {
      requestId: "req-1",
      createdAt: "2026-03-28T12:00:00Z",
      consumer: {
        id: "consumer-1"
      },
      prediction: {
        domain: "weather.precipitation",
        question: "Will rainfall exceed 10mm?",
        horizon: "24h",
        desiredOutput: "binary-probability"
      }
    };

    expect(validatePredictionRequest(value), formatValidationErrors(validatePredictionRequest.errors).join("\n")).toBe(
      true
    );
    expect(() => assertValidPredictionRequest(value)).not.toThrow();
  });

  it("validates a response through the exported validator", () => {
    const value = {
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
        probability: 0.62
      }
    };

    expect(
      validatePredictionResponse(value),
      formatValidationErrors(validatePredictionResponse.errors).join("\n")
    ).toBe(true);
    expect(() => assertValidPredictionResponse(value)).not.toThrow();
  });

  it("formats validator errors for invalid payloads", () => {
    const value = {
      protocolVersion: "0.1.0",
      name: "broken-provider",
      url: "https://provider.example.com",
      capabilities: {
        predictions: []
      }
    };

    expect(validateAgentCard(value)).toBe(false);
    const errors = formatValidationErrors(validateAgentCard.errors);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("must");
  });
});
