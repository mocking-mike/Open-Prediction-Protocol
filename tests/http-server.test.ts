import { afterEach, describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { PredictionClient } from "../src/client/index.js";
import { HttpPredictionTransport } from "../src/client/http.js";
import { PredictionHttpServer } from "../src/server/index.js";

describe("PredictionHttpServer", () => {
  let server: PredictionHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("serves agent card and health endpoints", async () => {
    server = new PredictionHttpServer({
      agentCard: {
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
      },
      predictionAgent: new PredictionAgent({
        provider: {
          id: "provider-1"
        },
        handler: async () => ({
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.61
          }
        })
      })
    });

    const address = await server.listen();
    const baseUrl = `http://${address.host}:${address.port}`;

    const agentCardResponse = await fetch(`${baseUrl}/.well-known/agent.json`);
    const healthResponse = await fetch(`${baseUrl}/health`);

    expect(agentCardResponse.status).toBe(200);
    expect(healthResponse.status).toBe(200);

    const agentCard = (await agentCardResponse.json()) as { name: string };
    const health = (await healthResponse.json()) as { status: string };

    expect(agentCard.name).toBe("weather-provider");
    expect(health.status).toBe("ok");
  });

  it("round-trips a prediction request over HTTP JSON-RPC", async () => {
    server = new PredictionHttpServer({
      agentCard: {
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
      },
      predictionAgent: new PredictionAgent({
        provider: {
          id: "provider-1"
        },
        handler: async () => ({
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.73
          }
        })
      })
    });

    const address = await server.listen();
    const transport = new HttpPredictionTransport({
      baseUrl: `http://${address.host}:${address.port}`
    });
    const client = new PredictionClient();

    const response = await client.request(
      {
        requestId: "req-http-1",
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
      },
      transport
    );

    expect(response.status).toBe("completed");
    if (response.status !== "completed") {
      throw new Error("Expected completed response");
    }
    expect(response.provider.id).toBe("provider-1");
    expect(response.forecast.type).toBe("binary-probability");
    if (response.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }
    expect(response.forecast.probability).toBe(0.73);
  });

  it("rejects oversized JSON-RPC request bodies", async () => {
    server = new PredictionHttpServer({
      agentCard: {
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
      },
      predictionAgent: new PredictionAgent({
        provider: {
          id: "provider-1"
        },
        handler: async () => ({
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.61
          }
        })
      })
    });

    const address = await server.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const largeBody = "x".repeat(1_048_577);

    const response = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: largeBody
    });

    expect(response.status).toBe(400);
  });
});
