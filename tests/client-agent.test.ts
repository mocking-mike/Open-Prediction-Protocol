import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { PredictionClient } from "../src/client/index.js";
import { createDidKeyIdentity } from "../src/security/identity.js";
import type { PredictionRequest, PredictionStreamEvent } from "../src/types/index.js";

function createRequest(): PredictionRequest {
  return {
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
}

describe("PredictionAgent and PredictionClient", () => {
  it("completes a request and returns a validated response", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.7
        }
      })
    });

    const client = new PredictionClient();
    const response = await client.request(createRequest(), {
      send: (request) => agent.handleRequest(request)
    });

    expect(response.status).toBe("completed");
    if (response.status !== "completed") {
      throw new Error("Expected completed response");
    }
    expect(response.provider.id).toBe("provider-1");
    expect(response.forecast.type).toBe("binary-probability");
  });

  it("returns a failed response when the handler throws", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      handler: async () => {
        throw new Error("upstream provider unavailable");
      }
    });

    const response = await agent.handleRequest(createRequest());

    expect(response.status).toBe("failed");
    if (response.status !== "failed") {
      throw new Error("Expected failed response");
    }
    expect(response.error.code).toBe("prediction_failed");
    expect(response.error.message).toContain("upstream provider unavailable");
  });

  it("rejects invalid responses returned by a transport", async () => {
    const client = new PredictionClient();

    await expect(
      client.request(createRequest(), {
        send: async () => ({
          requestId: "req-1",
          status: "completed"
        })
      })
    ).rejects.toThrow();
  });

  it("optionally verifies signed responses on the client", async () => {
    const identity = createDidKeyIdentity();
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      identity,
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.7
        }
      })
    });

    const client = new PredictionClient({ verifySignature: true });
    const response = await client.request(createRequest(), {
      send: (request) => agent.handleRequest(request)
    });

    expect(response.status).toBe("completed");
  });

  it("streams lifecycle updates before the terminal response", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.7
        }
      })
    });

    const events: PredictionStreamEvent[] = [];
    for await (const event of agent.streamRequest(createRequest())) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "lifecycle",
      state: "submitted",
      requestId: "req-1"
    });
    expect(events[1]).toMatchObject({
      type: "lifecycle",
      state: "working",
      requestId: "req-1"
    });
    expect(events[2]?.type).toBe("result");
    if (events[2]?.type !== "result") {
      throw new Error("Expected a terminal result event");
    }
    expect(events[2].response.status).toBe("completed");
  });
});
