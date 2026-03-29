import { describe, expect, it } from "vitest";

import {
  evaluateGoldenTask,
  summarizeGoldenTaskEvaluations
} from "../src/observability/golden-tasks.js";
import type { AgentCard, PredictionResponse } from "../src/types/index.js";

describe("observability golden tasks", () => {
  it("evaluates a known-answer binary response and updates calibration", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      identity: {
        id: "provider-1"
      },
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

    const response: PredictionResponse = {
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
        probability: 0.8
      }
    };

    const evaluation = evaluateGoldenTask({
      agentCard,
      task: {
        id: "golden-rain-1",
        domain: "weather.precipitation",
        question: "Will it rain in Warsaw tomorrow?",
        horizon: "24h",
        expectedOutcome: true
      },
      response,
      resolvedAt: "2026-03-29T00:00:00Z"
    });

    expect(evaluation.taskId).toBe("golden-rain-1");
    expect(evaluation.domain).toBe("weather.precipitation");
    expect(evaluation.scoreType).toBe("brier");
    expect(evaluation.correct).toBe(true);
    expect(evaluation.score).toBeCloseTo(0.04, 10);
    const calibration = evaluation.updatedAgentCard.calibration?.domains[0];
    expect(calibration).toMatchObject({
      domain: "weather.precipitation",
      scoreType: "brier",
      sampleSize: 1,
      verificationStatus: "verified",
      coverage: {
        from: "2026-03-29T00:00:00Z",
        to: "2026-03-29T00:00:00Z"
      }
    });
    expect(calibration?.score).toBeCloseTo(0.04, 10);
  });

  it("rejects responses that do not match the golden task domain or horizon", () => {
    const agentCard: AgentCard = {
      protocolVersion: "0.1.0",
      name: "weather-provider",
      url: "https://provider.example.com",
      identity: {
        id: "provider-1"
      },
      capabilities: {
        predictions: [
          {
            id: "weather.temperature.daily",
            domain: "weather.temperature",
            title: "Daily temperature outlook",
            output: {
              type: "binary-probability"
            },
            horizons: ["24h"]
          }
        ]
      }
    };

    const response: PredictionResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      forecast: {
        type: "binary-probability",
        domain: "weather.temperature",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        probability: 0.8
      }
    };

    expect(() =>
      evaluateGoldenTask({
        agentCard,
        task: {
          id: "golden-rain-1",
          domain: "weather.precipitation",
          question: "Will it rain in Warsaw tomorrow?",
          horizon: "12h",
          expectedOutcome: true
        },
        response,
        resolvedAt: "2026-03-29T00:00:00Z"
      })
    ).toThrow("Prediction response does not match golden task target");
  });

  it("summarizes golden-task evaluation accuracy and score averages by type", () => {
    const summary = summarizeGoldenTaskEvaluations([
      {
        taskId: "golden-rain-1",
        domain: "weather.precipitation",
        requestId: "req-1",
        responseId: "resp-1",
        scoreType: "brier",
        score: 0.04,
        correct: true,
        observation: {
          probability: 0.8,
          outcome: true
        },
        updatedAgentCard: {} as AgentCard
      },
      {
        taskId: "golden-rain-2",
        domain: "weather.precipitation",
        requestId: "req-2",
        responseId: "resp-2",
        scoreType: "log",
        score: 0.22,
        correct: true,
        observation: {
          probability: 0.8,
          outcome: true
        },
        updatedAgentCard: {} as AgentCard
      },
      {
        taskId: "golden-rain-3",
        domain: "climate.temperature",
        requestId: "req-3",
        responseId: "resp-3",
        scoreType: "brier",
        score: 0.81,
        correct: false,
        observation: {
          probability: 0.9,
          outcome: false
        },
        updatedAgentCard: {} as AgentCard
      }
    ]);

    expect(summary.totalEvaluations).toBe(3);
    expect(summary.correctCount).toBe(2);
    expect(summary.accuracy).toBe(2 / 3);
    expect(summary.averageScores.brier).toBeCloseTo(0.425, 10);
    expect(summary.averageScores.log).toBeCloseTo(0.22, 10);
    expect(summary.domains).toEqual(["climate.temperature", "weather.precipitation"]);
  });
});
