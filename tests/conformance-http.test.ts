import { afterEach, describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { runHttpProviderConformance } from "../src/conformance/http.js";
import { PredictionHttpServer } from "../src/server/index.js";
import type {
  AgentCard,
  CompletedPredictionResponse,
  PredictionResponse,
  PredictionStreamEvent
} from "../src/types/index.js";

function createAgentCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
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
    },
    ...overrides
  };
}

function createCompletedResponse(
  overrides: Partial<CompletedPredictionResponse> = {}
): CompletedPredictionResponse {
  return {
    responseId: "resp-1",
    requestId: "opp-conformance-request",
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
      probability: 0.73
    },
    ...overrides
  };
}

function encodeSseEvent(event: PredictionStreamEvent): string {
  const eventName = event.type === "lifecycle" ? "lifecycle" : "result";
  return `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createConformanceFetch(options: {
  rpcPayload?: unknown;
  streamEvents?: PredictionStreamEvent[];
  invalidRequestErrorMessage?: string;
  invalidStreamRequestErrorMessage?: string;
}): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/.well-known/agent.json")) {
      return new Response(JSON.stringify(createAgentCard()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    if (url.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params?: {
        requestId?: string;
      };
      id?: string;
    };

    if (body.method === "predictions.request" && body.params?.requestId === "opp-conformance-request") {
      return new Response(
        JSON.stringify(
          options.rpcPayload ?? {
            jsonrpc: "2.0",
            id: "opp-conformance-request",
            result: createCompletedResponse()
          }
        ),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (body.method === "tasks/sendSubscribe" && body.params?.requestId === "opp-conformance-request") {
      const events =
        options.streamEvents ??
        ([
          {
            type: "lifecycle",
            requestId: "opp-conformance-request",
            createdAt: "2026-03-28T12:00:00Z",
            state: "submitted",
            provider: {
              id: "provider-1"
            }
          },
          {
            type: "lifecycle",
            requestId: "opp-conformance-request",
            createdAt: "2026-03-28T12:00:01Z",
            state: "working",
            provider: {
              id: "provider-1"
            }
          },
          {
            type: "result",
            response: createCompletedResponse()
          }
        ] satisfies PredictionStreamEvent[]);

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        }
      );
    }

    if (body.method === "predictions.request") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: {
            code: -32000,
            message:
              options.invalidRequestErrorMessage ??
              "Request validation failed"
          }
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (body.method === "tasks/sendSubscribe") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: {
            code: -32000,
            message:
              options.invalidStreamRequestErrorMessage ??
              "Request validation failed"
          }
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    throw new Error(`Unhandled conformance fetch request: ${body.method}`);
  };
}

function checksById(report: Awaited<ReturnType<typeof runHttpProviderConformance>>): Map<string, { ok: boolean }> {
  return new Map(report.checks.map((check) => [check.id, { ok: check.ok }]));
}

describe("HTTP provider conformance", () => {
  let server: PredictionHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("passes against the reference HTTP provider surface", async () => {
    server = new PredictionHttpServer({
      agentCard: createAgentCard(),
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
    const report = await runHttpProviderConformance({
      baseUrl: `http://${address.host}:${address.port}`
    });

    expect(report.checks.filter((check) => !check.ok && check.severity === "error")).toEqual([]);
    expect(report.checks.some((check) => check.id === "stream.result" && check.ok)).toBe(true);
    expect(report.checks.some((check) => check.id === "rpc.providerBinding" && check.ok)).toBe(true);
    expect(report.checks.some((check) => check.id === "errors.invalidRequest.sanitized" && check.ok)).toBe(true);
  });

  it("reports binding and malformed-stream failures from a non-conforming provider", async () => {
    const report = await runHttpProviderConformance({
      baseUrl: "https://provider.example.com",
      fetchImpl: createConformanceFetch({
        rpcPayload: {
          jsonrpc: "2.0",
          id: "rpc-other",
          result: createCompletedResponse({
            requestId: "rpc-other",
            provider: {
              id: "unexpected-provider"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "48h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.73
            }
          })
        },
        streamEvents: [
          {
            type: "lifecycle",
            requestId: "stream-other",
            createdAt: "2026-03-28T12:00:00Z",
            state: "submitted",
            provider: {
              id: "unexpected-provider"
            }
          },
          {
            type: "result",
            response: createCompletedResponse({
              requestId: "stream-other",
              provider: {
                id: "unexpected-provider"
              },
              forecast: {
                type: "binary-probability",
                domain: "weather.precipitation",
                horizon: "48h",
                generatedAt: "2026-03-28T12:01:00Z",
                probability: 0.73
              }
            })
          },
          {
            type: "result",
            response: createCompletedResponse({
              responseId: "resp-2",
              requestId: "stream-other",
              provider: {
                id: "unexpected-provider"
              },
              forecast: {
                type: "binary-probability",
                domain: "weather.precipitation",
                horizon: "48h",
                generatedAt: "2026-03-28T12:01:30Z",
                probability: 0.55
              }
            })
          },
          {
            type: "lifecycle",
            requestId: "stream-other",
            createdAt: "2026-03-28T12:00:02Z",
            state: "working",
            provider: {
              id: "unexpected-provider"
            }
          }
        ]
      })
    });

    const checks = checksById(report);
    expect(checks.get("rpc.idBinding")?.ok).toBe(false);
    expect(checks.get("rpc.requestBinding")?.ok).toBe(false);
    expect(checks.get("rpc.forecastHorizonBinding")?.ok).toBe(false);
    expect(checks.get("rpc.providerBinding")?.ok).toBe(false);
    expect(checks.get("stream.lifecycleRequestBinding")?.ok).toBe(false);
    expect(checks.get("stream.resultRequestBinding")?.ok).toBe(false);
    expect(checks.get("stream.forecastHorizonBinding")?.ok).toBe(false);
    expect(checks.get("stream.providerBinding")?.ok).toBe(false);
    expect(checks.get("stream.resultCardinality")?.ok).toBe(false);
    expect(checks.get("stream.terminalResultLast")?.ok).toBe(false);
  });

  it("reports unsanitized invalid-request errors from a non-conforming provider", async () => {
    const rawValidationMessage =
      "/ must have required property 'requestId'; / must have required property 'createdAt'";
    const report = await runHttpProviderConformance({
      baseUrl: "https://provider.example.com",
      fetchImpl: createConformanceFetch({
        invalidRequestErrorMessage: rawValidationMessage,
        invalidStreamRequestErrorMessage: rawValidationMessage
      })
    });

    const checks = checksById(report);
    expect(checks.get("errors.invalidRequest.sanitized")?.ok).toBe(false);
    expect(checks.get("errors.invalidStreamRequest.sanitized")?.ok).toBe(false);
  });
});
