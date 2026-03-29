import { describe, expect, it } from "vitest";

import {
  applyCalibrationObservation,
  calculateBinaryBrierScore,
  calculateBinaryLogScore,
  createDomainCalibrationSnapshot,
  updateAgentCardCalibration
} from "../src/observability/metrics.js";
import type { AgentCard, DomainCalibration } from "../src/types/index.js";

describe("observability metrics", () => {
  it("calculates binary Brier score", () => {
    expect(calculateBinaryBrierScore(0.8, true)).toBeCloseTo(0.04, 10);
    expect(calculateBinaryBrierScore(0.2, false)).toBeCloseTo(0.04, 10);
    expect(calculateBinaryBrierScore(0.8, false)).toBeCloseTo(0.64, 10);
  });

  it("calculates binary log score", () => {
    expect(calculateBinaryLogScore(0.8, true)).toBeCloseTo(-Math.log(0.8), 10);
    expect(calculateBinaryLogScore(0.2, false)).toBeCloseTo(-Math.log(0.8), 10);
    expect(calculateBinaryLogScore(0, true)).toBeGreaterThan(10);
  });

  it("builds a calibration snapshot from resolved observations", () => {
    const calibration = createDomainCalibrationSnapshot({
      domain: "weather.precipitation",
      scoreType: "brier",
      verificationStatus: "verified",
      verifiedBy: ["did:key:z6Mkverifier"],
      observations: [
        {
          probability: 0.8,
          outcome: true,
          resolvedAt: "2026-03-01T00:00:00Z"
        },
        {
          probability: 0.2,
          outcome: false,
          resolvedAt: "2026-03-03T00:00:00Z"
        }
      ]
    });

    expect(calibration.domain).toBe("weather.precipitation");
    expect(calibration.scoreType).toBe("brier");
    expect(calibration.score).toBeCloseTo(0.04, 10);
    expect(calibration.sampleSize).toBe(2);
    expect(calibration.verificationStatus).toBe("verified");
    expect(calibration.verifiedBy).toEqual(["did:key:z6Mkverifier"]);
    expect(calibration.coverage).toEqual({
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-03T00:00:00Z"
    });
  });

  it("applies one resolved observation to an existing calibration entry", () => {
    const existing: DomainCalibration = {
      domain: "weather.precipitation",
      scoreType: "brier",
      score: 0.1,
      sampleSize: 4,
      verificationStatus: "provisional",
      coverage: {
        from: "2026-03-01T00:00:00Z",
        to: "2026-03-04T00:00:00Z"
      }
    };

    const updated = applyCalibrationObservation(existing, {
      probability: 0.8,
      outcome: true,
      resolvedAt: "2026-03-05T00:00:00Z"
    });

    expect(updated.score).toBeCloseTo(0.088, 10);
    expect(updated.sampleSize).toBe(5);
    expect(updated.coverage).toEqual({
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-05T00:00:00Z"
    });
  });

  it("updates one agent-card calibration domain without disturbing others", () => {
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
      },
      calibration: {
        domains: [
          {
            domain: "weather.precipitation",
            scoreType: "brier",
            score: 0.1,
            sampleSize: 4,
            verificationStatus: "verified"
          },
          {
            domain: "finance.forex",
            scoreType: "log",
            score: 0.4,
            sampleSize: 12,
            verificationStatus: "self-reported"
          }
        ]
      }
    };

    const updated = updateAgentCardCalibration(agentCard, {
      domain: "weather.precipitation",
      observation: {
        probability: 0.8,
        outcome: true,
        resolvedAt: "2026-03-05T00:00:00Z"
      }
    });

    expect(updated).not.toBe(agentCard);
    expect(updated.calibration?.domains).toHaveLength(2);
    expect(updated.calibration?.domains.find((entry) => entry.domain === "weather.precipitation")?.sampleSize).toBe(5);
    expect(updated.calibration?.domains.find((entry) => entry.domain === "finance.forex")).toEqual(
      agentCard.calibration?.domains.find((entry) => entry.domain === "finance.forex")
    );
  });

  it("updates verification metadata when refreshing an existing calibration domain", () => {
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
      },
      calibration: {
        domains: [
          {
            domain: "weather.precipitation",
            scoreType: "brier",
            score: 0.1,
            sampleSize: 4,
            verificationStatus: "self-reported"
          }
        ]
      }
    };

    const updated = updateAgentCardCalibration(agentCard, {
      domain: "weather.precipitation",
      verificationStatus: "verified",
      verifiedBy: ["did:key:z6Mkverifier"],
      observation: {
        probability: 0.8,
        outcome: true,
        resolvedAt: "2026-03-05T00:00:00Z"
      }
    });

    expect(updated.calibration?.domains[0]?.verificationStatus).toBe("verified");
    expect(updated.calibration?.domains[0]?.verifiedBy).toEqual(["did:key:z6Mkverifier"]);
  });

  it("creates a new calibration entry when the domain is not present", () => {
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

    const updated = updateAgentCardCalibration(agentCard, {
      domain: "weather.precipitation",
      scoreType: "brier",
      verificationStatus: "self-reported",
      observation: {
        probability: 0.8,
        outcome: true,
        resolvedAt: "2026-03-05T00:00:00Z"
      }
    });

    expect(updated.calibration?.domains).toHaveLength(1);
    expect(updated.calibration?.domains[0]?.domain).toBe("weather.precipitation");
    expect(updated.calibration?.domains[0]?.scoreType).toBe("brier");
    expect(updated.calibration?.domains[0]?.score).toBeCloseTo(0.04, 10);
    expect(updated.calibration?.domains[0]?.sampleSize).toBe(1);
    expect(updated.calibration?.domains[0]?.verificationStatus).toBe("self-reported");
    expect(updated.calibration?.domains[0]?.coverage).toEqual({
      from: "2026-03-05T00:00:00Z",
      to: "2026-03-05T00:00:00Z"
    });
  });

  it("rejects calibration updates when aggregate score is missing on a populated entry", () => {
    const existing: DomainCalibration = {
      domain: "weather.precipitation",
      scoreType: "brier",
      sampleSize: 4,
      verificationStatus: "provisional"
    };

    expect(() =>
      applyCalibrationObservation(existing, {
        probability: 0.8,
        outcome: true,
        resolvedAt: "2026-03-05T00:00:00Z"
      })
    ).toThrow("Cannot update calibration metadata without an existing aggregate score");
  });

  it("rejects attempts to change score type for an existing calibration domain", () => {
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
      },
      calibration: {
        domains: [
          {
            domain: "weather.precipitation",
            scoreType: "brier",
            score: 0.1,
            sampleSize: 4,
            verificationStatus: "verified"
          }
        ]
      }
    };

    expect(() =>
      updateAgentCardCalibration(agentCard, {
        domain: "weather.precipitation",
        scoreType: "log",
        observation: {
          probability: 0.8,
          outcome: true,
          resolvedAt: "2026-03-05T00:00:00Z"
        }
      })
    ).toThrow("Cannot change calibration scoreType for an existing domain entry");
  });

  it("rejects calibration updates for domains not advertised by the agent card", () => {
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

    expect(() =>
      updateAgentCardCalibration(agentCard, {
        domain: "finance.forex",
        observation: {
          probability: 0.8,
          outcome: true,
          resolvedAt: "2026-03-05T00:00:00Z"
        }
      })
    ).toThrow("AgentCard does not advertise calibration domain: finance.forex");
  });

  it("rejects invalid resolvedAt timestamps in observability helpers", () => {
    expect(() =>
      createDomainCalibrationSnapshot({
        domain: "weather.precipitation",
        scoreType: "brier",
        verificationStatus: "self-reported",
        observations: [
          {
            probability: 0.8,
            outcome: true,
            resolvedAt: "not-a-date"
          }
        ]
      })
    ).toThrow("resolvedAt must be a valid date-time: not-a-date");
  });
});
