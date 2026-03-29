import { describe, expect, it } from "vitest";

import {
  ConditionalTriggerRegistry,
  evaluateConditionalTrigger
} from "../src/client/conditional.js";
import type { PredictionRequest, PredictionResponse } from "../src/types/index.js";

describe("client conditional triggers", () => {
  it("triggers a follow-up request when a binary forecast crosses the threshold", () => {
    const followUp = createFollowUpRequest();
    const trigger = evaluateConditionalTrigger(
      {
        id: "trigger-1",
        sourceDomain: "weather.precipitation",
        probabilityGte: 0.7,
        followUpRequest: followUp
      },
      createBinaryResponse(0.82)
    );

    expect(trigger).toEqual({
      ruleId: "trigger-1",
      request: {
        ...followUp,
        prediction: {
          ...followUp.prediction,
          context: {
            ...(followUp.prediction.context ?? {}),
            parentResponseId: "resp-1",
            parentDomain: "weather.precipitation"
          }
        }
      }
    });
  });

  it("does not trigger when the response does not satisfy the rule", () => {
    const trigger = evaluateConditionalTrigger(
      {
        id: "trigger-1",
        sourceDomain: "weather.precipitation",
        probabilityGte: 0.9,
        followUpRequest: createFollowUpRequest()
      },
      createBinaryResponse(0.82)
    );

    expect(trigger).toBeUndefined();
  });

  it("manages subscriptions and evaluates all matching rules", () => {
    const registry = new ConditionalTriggerRegistry();
    registry.subscribe({
      id: "trigger-1",
      sourceDomain: "weather.precipitation",
      probabilityGte: 0.7,
      followUpRequest: createFollowUpRequest("req-follow-1")
    });
    registry.subscribe({
      id: "trigger-2",
      sourceDomain: "weather.precipitation",
      probabilityLte: 0.4,
      followUpRequest: createFollowUpRequest("req-follow-2")
    });

    const triggered = registry.evaluate(createBinaryResponse(0.82));

    expect(triggered.map((entry) => entry.ruleId)).toEqual(["trigger-1"]);
    expect(registry.unsubscribe("trigger-2")).toBe(true);
    expect(registry.unsubscribe("missing")).toBe(false);
  });
});

function createFollowUpRequest(requestId = "req-follow-1"): PredictionRequest {
  return {
    requestId,
    createdAt: "2026-03-29T20:00:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "logistics.delay",
      question: "Will regional delivery delays exceed 2 hours?",
      horizon: "24h",
      desiredOutput: "binary-probability",
      context: {
        region: "central-eu"
      }
    }
  };
}

function createBinaryResponse(probability: number): PredictionResponse {
  return {
    responseId: "resp-1",
    requestId: "req-1",
    status: "completed",
    createdAt: "2026-03-29T19:00:00Z",
    provider: {
      id: "provider-1"
    },
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: "24h",
      generatedAt: "2026-03-29T19:00:00Z",
      probability
    }
  };
}
