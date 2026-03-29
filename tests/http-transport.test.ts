import { describe, expect, it } from "vitest";

import { HttpPredictionTransport } from "../src/client/http.js";
import type { PredictionRequest } from "../src/types/index.js";

function createRequest(): PredictionRequest {
  return {
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
  };
}

describe("HttpPredictionTransport", () => {
  it("rejects JSON-RPC replies whose id does not match the active request", async () => {
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "req-other",
            result: {
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
                probability: 0.5
              }
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    await expect(transport.send(createRequest())).rejects.toThrow(
      "JSON-RPC response id does not match request"
    );
  });

  it("rejects oversized JSON-RPC response bodies", async () => {
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      maxResponseBytes: 32,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "req-1",
            result: {
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
                probability: 0.5
              }
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    await expect(transport.send(createRequest())).rejects.toThrow(
      "response body exceeded maximum size"
    );
  });

  it("times out stalled non-streaming requests", async () => {
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      requestTimeoutMs: 10,
      fetchImpl: async () => await new Promise<Response>(() => undefined)
    });

    await expect(transport.send(createRequest())).rejects.toThrow("request timed out");
  });

  it("supports caller-driven abort for non-streaming requests", async () => {
    const controller = new AbortController();
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () => await new Promise<Response>(() => undefined)
    });

    setTimeout(() => controller.abort(), 10);

    await expect(
      transport.send(createRequest(), {
        signal: controller.signal
      })
    ).rejects.toThrow("Prediction transport aborted");
  });
});
