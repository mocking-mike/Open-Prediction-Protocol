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

  it("sanitizes JSON-RPC validation errors by default and reports raw diagnostics", async () => {
    const reported: {
      category?: string;
      publicMessage?: string;
      method?: string | undefined;
      requestId?: string | undefined;
      rawMessage?: string | undefined;
    } = {};

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
      }),
      errorReporter: (event) => {
        reported.category = event.category;
        reported.publicMessage = event.publicMessage;
        reported.method = event.method;
        reported.requestId = event.requestId;
        reported.rawMessage = event.error instanceof Error ? event.error.message : String(event.error);
      }
    });

    const address = await server.listen();
    const response = await fetch(`http://${address.host}:${address.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-invalid",
        method: "predictions.request",
        params: {}
      })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "req-invalid",
      error: {
        code: -32000,
        message: "Request validation failed"
      }
    });
    expect(reported).toMatchObject({
      category: "validation",
      publicMessage: "Request validation failed",
      method: "predictions.request",
      requestId: "req-invalid"
    });
    expect(reported.rawMessage).toContain("requestId");
  });

  it("can expose detailed JSON-RPC validation errors when configured", async () => {
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
      }),
      exposeErrorDetails: true
    });

    const address = await server.listen();
    const response = await fetch(`http://${address.host}:${address.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-invalid",
        method: "predictions.request",
        params: {}
      })
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: {
        message: string;
      };
    };
    expect(payload.error.message).toContain("requestId");
  });

  it("returns a structured JSON-RPC error for invalid streamed requests before headers flush", async () => {
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
    const response = await fetch(`http://${address.host}:${address.port}/rpc`, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-invalid-stream",
        method: "tasks/sendSubscribe",
        params: {}
      })
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "req-invalid-stream",
      error: {
        code: -32000,
        message: "Request validation failed"
      }
    });
  });

  it("aborts provider-side streaming work when the client disconnects", async () => {
    let aborted = false;

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
        handler: async (_request, context) =>
          await new Promise((_resolve, reject) => {
            context.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          })
      })
    });

    let address: { host: string; port: number };
    try {
      address = await server.listen();
    } catch (error) {
      if (error instanceof Error && error.message.includes("EPERM")) {
        server = undefined;
        return;
      }
      throw error;
    }

    const controller = new AbortController();
    const response = await fetch(`http://${address.host}:${address.port}/rpc`, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-abort-stream",
        method: "tasks/sendSubscribe",
        params: {
          requestId: "req-abort-stream",
          createdAt: "2026-03-29T12:00:00Z",
          consumer: {
            id: "consumer-1"
          },
          prediction: {
            domain: "weather.precipitation",
            question: "Will rainfall exceed 10mm?",
            horizon: "24h",
            desiredOutput: "binary-probability"
          }
        }
      }),
      signal: controller.signal
    });

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    await reader?.read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(aborted).toBe(true);
  });
});
