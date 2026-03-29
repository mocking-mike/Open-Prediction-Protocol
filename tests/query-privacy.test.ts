import { describe, expect, it } from "vitest";

import {
  createCommittedPredictionRequest,
  isCommittedPredictionRequest,
  verifyCommittedPredictionReveal
} from "../src/security/query-privacy.js";
import type { PredictionRequest } from "../src/types/index.js";

describe("query privacy", () => {
  it("creates a schema-compatible committed prediction request plus a local reveal secret", () => {
    const request = createRequest();

    const { request: committed, reveal } = createCommittedPredictionRequest(request, {
      preserveContextKeys: ["location"]
    });

    expect(committed.privacy?.mode).toBe("committed");
    expect(committed.prediction.question).toBe("[REDACTED]");
    expect(committed.prediction.resolution).toBe("[REDACTED]");
    expect(committed.prediction.context).toEqual({
      location: "Warsaw"
    });
    expect(committed.privacy?.commitment).toMatchObject({
      scheme: "opp-hmac-sha256-v1",
      question: expect.any(String),
      resolution: expect.any(String),
      context: expect.any(String),
      redactedKeys: ["signalSource", "thresholdMm"]
    });
    expect(reveal).toMatchObject({
      scheme: "opp-hmac-sha256-v1",
      secret: expect.any(String)
    });
    expect(isCommittedPredictionRequest(committed)).toBe(true);
  });

  it("verifies a committed request against the original reveal and local secret", () => {
    const request = createRequest();
    const { request: committed, reveal } = createCommittedPredictionRequest(request, {
      preserveContextKeys: ["location"]
    });

    expect(
      verifyCommittedPredictionReveal({
        committedRequest: committed,
        originalRequest: request,
        reveal
      })
    ).toBe(true);
  });

  it("uses a fresh commitment secret so identical requests are not linkable by default", () => {
    const request = createRequest();
    const first = createCommittedPredictionRequest(request);
    const second = createCommittedPredictionRequest(request);

    expect(first.request.privacy?.commitment?.question).not.toBe(
      second.request.privacy?.commitment?.question
    );
    expect(first.request.privacy?.commitment?.context).not.toBe(
      second.request.privacy?.commitment?.context
    );
  });

  it("rejects reveal verification when the original question does not match", () => {
    const request = createRequest();
    const { request: committed, reveal } = createCommittedPredictionRequest(request);

    const tampered: PredictionRequest = {
      ...request,
      prediction: {
        ...request.prediction,
        question: "A different question"
      }
    };

    expect(
      verifyCommittedPredictionReveal({
        committedRequest: committed,
        originalRequest: tampered,
        reveal
      })
    ).toBe(false);
  });

  it("rejects reveal verification when the reveal secret does not match", () => {
    const request = createRequest();
    const { request: committed } = createCommittedPredictionRequest(request);

    expect(
      verifyCommittedPredictionReveal({
        committedRequest: committed,
        originalRequest: request,
        reveal: {
          scheme: "opp-hmac-sha256-v1",
          secret: "wrong-secret"
        }
      })
    ).toBe(false);
  });

  it("rejects reveal verification when preserved visible context no longer matches the original request", () => {
    const request = createRequest();
    const { request: committed, reveal } = createCommittedPredictionRequest(request, {
      preserveContextKeys: ["location"]
    });

    const tamperedCommitted: PredictionRequest = {
      ...committed,
      prediction: {
        ...committed.prediction,
        context: {
          location: "Berlin"
        }
      }
    };

    expect(
      verifyCommittedPredictionReveal({
        committedRequest: tamperedCommitted,
        originalRequest: request,
        reveal
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
