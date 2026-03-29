import { describe, expect, it } from "vitest";

import {
  createBlindedPredictionRequest,
  isBlindedPredictionRequest,
  verifyBlindedPredictionReveal
} from "../src/security/query-privacy.js";
import type { PredictionRequest } from "../src/types/index.js";

describe("query privacy", () => {
  it("creates a schema-compatible blinded prediction request", () => {
    const request = createRequest();

    const blinded = createBlindedPredictionRequest(request, {
      preserveContextKeys: ["location"]
    });

    expect(blinded.privacy?.mode).toBe("blinded");
    expect(blinded.prediction.question).toBe("[BLINDED]");
    expect(blinded.prediction.resolution).toBe("[BLINDED]");
    expect(blinded.prediction.context).toMatchObject({
      location: "Warsaw",
      _blinded: true,
      _questionHash: expect.any(String),
      _resolutionHash: expect.any(String),
      _contextHash: expect.any(String),
      _redactedKeys: ["signalSource", "thresholdMm"]
    });
    expect(isBlindedPredictionRequest(blinded)).toBe(true);
  });

  it("verifies a blinded request against the original reveal", () => {
    const request = createRequest();
    const blinded = createBlindedPredictionRequest(request, {
      preserveContextKeys: ["location"]
    });

    expect(
      verifyBlindedPredictionReveal({
        blindedRequest: blinded,
        originalRequest: request
      })
    ).toBe(true);
  });

  it("rejects reveal verification when the original question does not match", () => {
    const request = createRequest();
    const blinded = createBlindedPredictionRequest(request);

    const tampered: PredictionRequest = {
      ...request,
      prediction: {
        ...request.prediction,
        question: "A different question"
      }
    };

    expect(
      verifyBlindedPredictionReveal({
        blindedRequest: blinded,
        originalRequest: tampered
      })
    ).toBe(false);
  });
});

function createRequest(): PredictionRequest {
  return {
    requestId: "req-privacy-1",
    createdAt: "2026-03-29T18:00:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Will rainfall exceed 10mm in Warsaw tomorrow?",
      horizon: "24h",
      desiredOutput: "binary-probability",
      resolution: "Rainfall exceeds 10mm by gauge reading",
      context: {
        location: "Warsaw",
        thresholdMm: 10,
        signalSource: "internal-planning-model"
      }
    },
    privacy: {
      mode: "plain"
    }
  };
}
