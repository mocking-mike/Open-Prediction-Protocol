import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { PredictionClient } from "../src/client/index.js";
import { createDidKeyIdentity } from "../src/security/identity.js";
import type {
  AgentCard,
  CompletedPredictionResponse,
  PredictionRequest,
  PredictionStreamEvent
} from "../src/types/index.js";

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

function createAgentCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    protocolVersion: "0.1.0",
    name: "provider-1-card",
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
    },
    ...overrides
  };
}

function createCompletedResponse(
  overrides: Partial<CompletedPredictionResponse> = {}
): CompletedPredictionResponse {
  return {
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
      probability: 0.7
    },
    ...overrides
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
    const reported: {
      category?: string;
      publicMessage?: string;
      requestId?: string | undefined;
      providerId?: string | undefined;
      rawMessage?: string | undefined;
    } = {};

    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      errorReporter: (event) => {
        reported.category = event.category;
        reported.publicMessage = event.publicMessage;
        reported.requestId = event.requestId;
        reported.providerId = event.providerId;
        reported.rawMessage = event.error instanceof Error ? event.error.message : String(event.error);
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
    expect(response.error.message).toBe("Prediction request failed");
    expect(reported).toMatchObject({
      category: "handler",
      publicMessage: "Prediction request failed",
      requestId: "req-1",
      providerId: "provider-1",
      rawMessage: "upstream provider unavailable"
    });
  });

  it("can expose detailed handler errors when configured", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      exposeErrorDetails: true,
      handler: async () => {
        throw new Error("upstream provider unavailable");
      }
    });

    const response = await agent.handleRequest(createRequest());

    expect(response.status).toBe("failed");
    if (response.status !== "failed") {
      throw new Error("Expected failed response");
    }
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

  it("rejects responses whose requestId does not match the active request", async () => {
    const client = new PredictionClient();

    await expect(
      client.request(createRequest(), {
        send: async () =>
          createCompletedResponse({
            requestId: "req-2"
          })
      })
    ).rejects.toThrow("requestId does not match request");
  });

  it("rejects completed responses whose forecast metadata does not match the request", async () => {
    const client = new PredictionClient();

    await expect(
      client.request(createRequest(), {
        send: async () =>
          createCompletedResponse({
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "48h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.7
            }
          })
      })
    ).rejects.toThrow("forecast horizon does not match request");
  });

  it("rejects provider identity mismatches when the expected Agent Card is known", async () => {
    const client = new PredictionClient();

    await expect(
      client.request(
        createRequest(),
        {
          send: async () =>
            createCompletedResponse({
              provider: {
                id: "provider-2"
              }
            })
        },
        createAgentCard()
      )
    ).rejects.toThrow("provider id does not match Agent Card identity");
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
