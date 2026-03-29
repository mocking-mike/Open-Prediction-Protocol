import { describe, expect, it } from "vitest";

import {
  createConfidenceMonitorSnapshot,
  detectConfidenceMonitorSignals
} from "../src/observability/confidence-monitor.js";
import type { AgentCard } from "../src/types/index.js";
import type { GoldenTaskEvaluationResult } from "../src/observability/golden-tasks.js";

describe("observability confidence monitor", () => {
  it("summarizes recent golden-task evaluations into confidence-monitor metrics", () => {
    const snapshot = createConfidenceMonitorSnapshot([
      createEvaluation({
        taskId: "task-1",
        domain: "weather.precipitation",
        probability: 0.8,
        outcome: true,
        scoreType: "brier",
        score: 0.04,
        correct: true
      }),
      createEvaluation({
        taskId: "task-2",
        domain: "weather.precipitation",
        probability: 0.7,
        outcome: false,
        scoreType: "brier",
        score: 0.49,
        correct: false
      }),
      createEvaluation({
        taskId: "task-3",
        domain: "climate.temperature",
        probability: 0.6,
        outcome: true,
        scoreType: "log",
        score: 0.51,
        correct: true
      })
    ]);

    expect(snapshot.totalEvaluations).toBe(3);
    expect(snapshot.averageConfidence).toBeCloseTo(0.7, 10);
    expect(snapshot.outcomeRate).toBeCloseTo(2 / 3, 10);
    expect(snapshot.confidenceGap).toBeCloseTo(Math.abs(0.7 - (2 / 3)), 10);
    expect(snapshot.averageScores.brier).toBeCloseTo(0.265, 10);
    expect(snapshot.averageScores.log).toBeCloseTo(0.51, 10);
    expect(snapshot.domains).toEqual(["climate.temperature", "weather.precipitation"]);
    expect(snapshot.domainBreakdown).toEqual({
      "climate.temperature": {
        evaluations: 1,
        averageConfidence: 0.6,
        outcomeRate: 1,
        confidenceGap: 0.4
      },
      "weather.precipitation": {
        evaluations: 2,
        averageConfidence: 0.75,
        outcomeRate: 0.5,
        confidenceGap: 0.25
      }
    });
  });

  it("emits calibration-gap and score-drift signals when thresholds are exceeded", () => {
    const baseline = createConfidenceMonitorSnapshot([
      createEvaluation({
        taskId: "baseline-1",
        domain: "weather.precipitation",
        probability: 0.55,
        outcome: true,
        scoreType: "brier",
        score: 0.2025,
        correct: true
      }),
      createEvaluation({
        taskId: "baseline-2",
        domain: "weather.precipitation",
        probability: 0.45,
        outcome: false,
        scoreType: "brier",
        score: 0.2025,
        correct: true
      })
    ]);

    const current = createConfidenceMonitorSnapshot([
      createEvaluation({
        taskId: "current-1",
        domain: "weather.precipitation",
        probability: 0.9,
        outcome: false,
        scoreType: "brier",
        score: 0.81,
        correct: false
      }),
      createEvaluation({
        taskId: "current-2",
        domain: "weather.precipitation",
        probability: 0.8,
        outcome: false,
        scoreType: "brier",
        score: 0.64,
        correct: false
      })
    ]);

    const result = detectConfidenceMonitorSignals(current, {
      baseline,
      minEvaluations: 2,
      confidenceGapThreshold: 0.2,
      scoreDriftThreshold: 0.3
    });

    expect(result.status).toBe("degraded");
    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]).toMatchObject({
      kind: "confidence-gap",
      severity: "warn",
      message:
        "Average confidence deviates from observed outcomes by 0.8500, above threshold 0.2000",
      threshold: 0.2
    });
    expect(result.signals[0]?.value).toBeCloseTo(0.85, 10);
    expect(result.signals[1]).toMatchObject({
      kind: "score-drift",
      severity: "degraded",
      message:
        "Average brier score drifted by 0.5225, above threshold 0.3000",
      threshold: 0.3
    });
    expect(result.signals[1]?.value).toBeCloseTo(0.5225, 10);
  });

  it("returns insufficient-data status when there are too few evaluations", () => {
    const snapshot = createConfidenceMonitorSnapshot([
      createEvaluation({
        taskId: "task-1",
        domain: "weather.precipitation",
        probability: 0.7,
        outcome: true,
        scoreType: "brier",
        score: 0.09,
        correct: true
      })
    ]);

    const result = detectConfidenceMonitorSignals(snapshot, {
      minEvaluations: 2
    });

    expect(result).toEqual({
      status: "insufficient-data",
      signals: [
        {
          kind: "insufficient-data",
          severity: "info",
          message: "Confidence monitoring requires at least 2 evaluations",
          value: 1,
          threshold: 2
        }
      ]
    });
  });
});

function createEvaluation(
  options: {
    taskId: string;
    domain: string;
    probability: number;
    outcome: boolean;
    scoreType: "brier" | "log";
    score: number;
    correct: boolean;
  }
): GoldenTaskEvaluationResult {
  return {
    taskId: options.taskId,
    domain: options.domain,
    requestId: `${options.taskId}-req`,
    responseId: `${options.taskId}-resp`,
    scoreType: options.scoreType,
    score: options.score,
    correct: options.correct,
    observation: {
      probability: options.probability,
      outcome: options.outcome
    },
    updatedAgentCard: {} as AgentCard
  };
}
