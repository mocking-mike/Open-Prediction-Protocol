import { describe, expect, it } from "vitest";

import {
  detectPredictionAnomalies,
  summarizePredictionAnomalies
} from "../src/security/anomaly-detector.js";
import type { BinaryOutcomeConsensusResult } from "../src/scoring/consensus.js";
import type { ConfidenceMonitorSignalResult } from "../src/observability/confidence-monitor.js";
import type { PredictionResponse } from "../src/types/index.js";

describe("anomaly detector", () => {
  it("detects consensus disagreement, stale freshness, and degraded monitor status", () => {
    const response = createResponse({
      freshness: {
        timestamp: "2026-03-29T10:00:00Z",
        nonce: "nonce-1"
      },
      signature: {
        alg: "Ed25519",
        value: "sig"
      }
    });

    const anomalies = detectPredictionAnomalies({
      response,
      consensus: createConsensus({
        agreementRatio: 0.55,
        dissentingScorers: ["scorer-2", "scorer-3"]
      }),
      monitor: {
        status: "degraded",
        signals: [
          {
            kind: "score-drift",
            severity: "degraded",
            message: "Average brier score drifted by 0.4",
            value: 0.4,
            threshold: 0.1
          }
        ]
      },
      expectedRecipientDid: "did:key:z6Mkconsumer",
      now: () => Date.parse("2026-03-29T12:30:00Z"),
      maxFreshnessAgeMs: 60 * 60 * 1000,
      minConsensusAgreementRatio: 0.66
    });

    expect(anomalies.status).toBe("warn");
    expect(anomalies.signals).toEqual([
      {
        kind: "low-consensus",
        severity: "warn",
        message: "Consensus agreement ratio 0.5500 is below minimum 0.6600",
        value: 0.55,
        threshold: 0.66
      },
      {
        kind: "stale-freshness",
        severity: "warn",
        message: "Response freshness age 9000000ms exceeds maximum 3600000ms",
        value: 9_000_000,
        threshold: 3_600_000
      },
      {
        kind: "recipient-mismatch",
        severity: "warn",
        message: "Signed response freshness is missing expected recipient DID binding",
        value: 0,
        threshold: 1
      },
      {
        kind: "monitor-degraded",
        severity: "warn",
        message: "Confidence monitoring reported degraded status",
        value: 1,
        threshold: 0
      }
    ]);
  });

  it("returns ok when no anomaly thresholds are crossed", () => {
    const anomalies = detectPredictionAnomalies({
      response: createResponse({
        freshness: {
          timestamp: "2026-03-29T12:00:00Z",
          nonce: "nonce-1",
          recipientDid: "did:key:z6Mkconsumer"
        }
      }),
      consensus: createConsensus({
        agreementRatio: 0.9,
        dissentingScorers: []
      }),
      monitor: {
        status: "ok",
        signals: []
      },
      expectedRecipientDid: "did:key:z6Mkconsumer",
      now: () => Date.parse("2026-03-29T12:10:00Z")
    });

    expect(anomalies).toEqual({
      status: "ok",
      signals: []
    });
  });

  it("summarizes anomaly output compactly", () => {
    const summary = summarizePredictionAnomalies({
      status: "warn",
      signals: [
        {
          kind: "low-consensus",
          severity: "warn",
          message: "Consensus agreement ratio 0.5500 is below minimum 0.6600",
          value: 0.55,
          threshold: 0.66
        },
        {
          kind: "stale-freshness",
          severity: "warn",
          message: "Response freshness age 9000000ms exceeds maximum 3600000ms",
          value: 9_000_000,
          threshold: 3_600_000
        }
      ]
    });

    expect(summary).toEqual({
      status: "warn",
      signalCount: 2,
      kinds: ["low-consensus", "stale-freshness"]
    });
  });
});

function createResponse(
  overrides: Partial<PredictionResponse> = {}
): PredictionResponse {
  return {
    responseId: "resp-1",
    requestId: "req-1",
    status: "completed",
    createdAt: "2026-03-29T10:01:00Z",
    provider: {
      id: "provider-1",
      did: "did:key:z6Mkprovider"
    },
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: "24h",
      generatedAt: "2026-03-29T10:01:00Z",
      probability: 0.8
    },
    ...overrides
  } as PredictionResponse;
}

function createConsensus(
  overrides: Partial<BinaryOutcomeConsensusResult>
): BinaryOutcomeConsensusResult {
  return {
    responseId: "resp-1",
    requestId: "req-1",
    domain: "weather.precipitation",
    strategy: "majority",
    agreedOutcome: true,
    agreementRatio: 0.75,
    participation: 4,
    dissentingScorers: ["scorer-4"],
    ...overrides
  };
}
