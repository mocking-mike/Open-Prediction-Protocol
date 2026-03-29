import { describe, expect, it, vi } from "vitest";

import {
  PredictionLedger,
  type PredictionResolutionLedgerRecord
} from "../src/scoring/ledger.js";
import type { PredictionRequest, PredictionResponse } from "../src/types/index.js";

describe("scoring ledger", () => {
  it("appends requests, responses, and resolutions into an integrity-checked chain", () => {
    const ledger = new PredictionLedger();
    const request = createRequest();
    const response = createResponse();
    const resolution: PredictionResolutionLedgerRecord = {
      requestId: request.requestId,
      responseId: response.responseId,
      domain: "weather.precipitation",
      scoreType: "brier",
      observation: {
        probability: 0.8,
        outcome: true,
        resolvedAt: "2026-03-30T00:00:00Z"
      },
      verificationStatus: "verified",
      verifiedBy: ["did:key:z6Mkverifier"]
    };

    const requestEntry = ledger.appendRequest(request);
    const responseEntry = ledger.appendResponse(response);
    const resolutionEntry = ledger.appendResolution(resolution);

    expect(requestEntry.sequence).toBe(1);
    expect(responseEntry.sequence).toBe(2);
    expect(resolutionEntry.sequence).toBe(3);
    expect(responseEntry.previousHash).toBe(requestEntry.entryHash);
    expect(resolutionEntry.previousHash).toBe(responseEntry.entryHash);
    expect(ledger.verifyIntegrity()).toBe(true);
  });

  it("rejects response records for unknown requests", () => {
    const ledger = new PredictionLedger();

    expect(() => ledger.appendResponse(createResponse())).toThrow(
      "Cannot append response for unknown request: req-1"
    );
  });

  it("rejects resolution records for unknown responses", () => {
    const ledger = new PredictionLedger();
    const request = createRequest();
    ledger.appendRequest(request);

    expect(() =>
      ledger.appendResolution({
        requestId: request.requestId,
        responseId: "resp-missing",
        domain: "weather.precipitation",
        scoreType: "brier",
        observation: {
          probability: 0.8,
          outcome: true
        }
      })
    ).toThrow("Cannot append resolution for unknown response: resp-missing");
  });

  it("returns immutable snapshots of the ledger state", () => {
    const ledger = new PredictionLedger();
    ledger.appendRequest(createRequest());

    const entries = ledger.getEntries();
    expect(entries).toHaveLength(1);

    const first = entries[0];
    if (!first) {
      throw new Error("Missing first ledger entry");
    }

    const mutated = {
      ...first,
      request: {
        ...(first.kind === "request" ? first.request : createRequest()),
        requestId: "tampered"
      }
    };

    expect(mutated.request.requestId).toBe("tampered");
    expect(ledger.getEntries()[0]).toMatchObject({
      kind: "request",
      request: {
        requestId: "req-1"
      }
    });
  });

  it("produces stable entry hashes for equivalent payloads with different property order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T10:05:00Z"));

    try {
      const firstLedger = new PredictionLedger();
      const secondLedger = new PredictionLedger();

      const firstRequest: PredictionRequest = {
        requestId: "req-ordered-1",
        createdAt: "2026-03-29T10:00:00Z",
        consumer: {
          id: "consumer-1"
        },
        prediction: {
          domain: "weather.precipitation",
          question: "Will it rain tomorrow in Warsaw?",
          horizon: "24h",
          desiredOutput: "binary-probability",
          context: {
            thresholdMm: 10,
            city: "Warsaw"
          }
        }
      };

      const secondRequest: PredictionRequest = {
        createdAt: "2026-03-29T10:00:00Z",
        requestId: "req-ordered-1",
        prediction: {
          question: "Will it rain tomorrow in Warsaw?",
          desiredOutput: "binary-probability",
          horizon: "24h",
          domain: "weather.precipitation",
          context: {
            city: "Warsaw",
            thresholdMm: 10
          }
        },
        consumer: {
          id: "consumer-1"
        }
      };

      const firstEntry = firstLedger.appendRequest(firstRequest);
      const secondEntry = secondLedger.appendRequest(secondRequest);

      expect(firstEntry.entryHash).toBe(secondEntry.entryHash);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createRequest(): PredictionRequest {
  return {
    requestId: "req-1",
    createdAt: "2026-03-29T10:00:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Will it rain tomorrow in Warsaw?",
      horizon: "24h",
      desiredOutput: "binary-probability"
    }
  };
}

function createResponse(): PredictionResponse {
  return {
    responseId: "resp-1",
    requestId: "req-1",
    status: "completed",
    createdAt: "2026-03-29T10:01:00Z",
    provider: {
      id: "provider-1"
    },
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: "24h",
      generatedAt: "2026-03-29T10:01:00Z",
      probability: 0.8
    }
  };
}
