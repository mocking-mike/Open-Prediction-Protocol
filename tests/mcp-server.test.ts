import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createPredictionMcpServer } from "../src/mcp/prediction-mcp-server.js";
import type { PredictionMcpProvider } from "../src/mcp/prediction-mcp-server.js";

function createProvider(
  id: string,
  probability: number,
  overrides?: Partial<PredictionMcpProvider["agentCard"]>
): PredictionMcpProvider {
  return {
    id,
    agentCard: {
      protocolVersion: "0.1.0",
      name: `${id}-provider`,
      url: `https://${id}.example.com`,
      capabilities: {
        predictions: [
          {
            id: `${id}-capability`,
            domain: "weather.precipitation",
            title: "Weather precipitation",
            output: {
              type: "binary-probability"
            },
            horizons: ["24h"]
          }
        ]
      },
      ...overrides
    },
    transport: {
      async send(request) {
        return {
          responseId: `${id}-response`,
          requestId: request.requestId,
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id
          },
          forecast: {
            type: "binary-probability",
            domain: request.prediction.domain,
            horizon: request.prediction.horizon,
            generatedAt: "2026-03-28T12:01:00Z",
            probability
          }
        };
      }
    }
  };
}

describe("Prediction MCP server", () => {
  let client: Client | undefined;
  let server: ReturnType<typeof createPredictionMcpServer> | undefined;

  afterEach(async () => {
    await client?.close();
    await server?.close();
    client = undefined;
    server = undefined;
  });

  it("lists configured providers as MCP tools output", async () => {
    server = createPredictionMcpServer({
      providers: [createProvider("weather-1", 0.4)]
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "opp-test-client",
      version: "0.1.0"
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_providers", "request_prediction", "aggregate_predictions"])
    );

    const result = await client.callTool({
      name: "list_providers",
      arguments: {}
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      providers: [
        {
          id: "weather-1",
          name: "weather-1-provider"
        }
      ]
    });
  });

  it("requests a prediction through the MCP tool surface", async () => {
    server = createPredictionMcpServer({
      providers: [createProvider("weather-1", 0.61)]
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "opp-test-client",
      version: "0.1.0"
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    const result = await client.callTool({
      name: "request_prediction",
      arguments: {
        providerId: "weather-1",
        request: {
          requestId: "req-1",
          createdAt: "2026-03-28T12:00:00Z",
          consumer: {
            id: "consumer-1"
          },
          prediction: {
            domain: "weather.precipitation",
            question: "Will it rain?",
            horizon: "24h",
            desiredOutput: "binary-probability"
          }
        }
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      provider: {
        id: "weather-1"
      },
      response: {
        status: "completed",
        forecast: {
          type: "binary-probability",
          probability: 0.61
        }
      }
    });
  });

  it("aggregates predictions across multiple configured providers", async () => {
    server = createPredictionMcpServer({
      providers: [
        createProvider("weather-1", 0.2),
        createProvider("weather-2", 0.8)
      ]
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "opp-test-client",
      version: "0.1.0"
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    const result = await client.callTool({
      name: "aggregate_predictions",
      arguments: {
        request: {
          requestId: "req-agg-1",
          createdAt: "2026-03-28T12:00:00Z",
          consumer: {
            id: "consumer-1"
          },
          prediction: {
            domain: "weather.precipitation",
            question: "Will it rain?",
            horizon: "24h",
            desiredOutput: "binary-probability"
          }
        }
      }
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      strategy: "equal-weight",
      contributors: expect.any(Array),
      forecast: {
        type: "binary-probability",
        probability: 0.5
      }
    });
  });
});
