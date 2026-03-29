import { describe, expect, it } from "vitest";

import { PredictionClient } from "../src/client/index.js";
import { HttpPredictionTransport } from "../src/client/http.js";
import type {
  AgentCard,
  PredictionRequest,
  PredictionResponse,
  PredictionStreamEvent
} from "../src/types/index.js";

function createRequest(): PredictionRequest {
  return {
    requestId: "req-stream-1",
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

function createCompletedResponse(): PredictionResponse {
  return {
    responseId: "resp-1",
    requestId: "req-stream-1",
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

function encodeSseEvent(event: PredictionStreamEvent): string {
  const eventName = event.type === "lifecycle" ? "lifecycle" : "result";
  return `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function collectEvents(
  source: AsyncIterable<PredictionStreamEvent>
): Promise<PredictionStreamEvent[]> {
  const events: PredictionStreamEvent[] = [];
  for await (const event of source) {
    events.push(event);
  }

  return events;
}

describe("HttpPredictionTransport streaming", () => {
  it("consumes server-sent lifecycle updates and the final result", async () => {
    const response = createCompletedResponse();
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      },
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:01Z",
        state: "working",
        provider: {
          id: "provider-1"
        }
      },
      {
        type: "result",
        response
      }
    ];

    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    const streamed: PredictionStreamEvent[] = [];
    for await (const event of client.requestStream(createRequest(), transport)) {
      streamed.push(event);
    }

    expect(streamed).toHaveLength(3);
    expect(streamed[0]).toMatchObject({
      type: "lifecycle",
      state: "submitted"
    });
    expect(streamed[1]).toMatchObject({
      type: "lifecycle",
      state: "working"
    });
    expect(streamed[2]).toMatchObject({
      type: "result",
      response
    });
  });

  it("parses SSE frames correctly when CRLF boundaries are split across chunks", async () => {
    const response = createCompletedResponse();
    const chunks = [
      "event: lifecycle\r",
      "\ndata: {\"type\":\"lifecycle\",\"requestId\":\"req-stream-1\",\"createdAt\":\"2026-03-28T12:00:00Z\",\"state\":\"submitted\"}\r",
      "\n\r",
      "\nevent: result\r\n",
      `data: ${JSON.stringify({ type: "result", response })}\r\n\r\n`
    ];

    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const events: PredictionStreamEvent[] = [];
    for await (const event of transport.stream(createRequest())) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "lifecycle",
      state: "submitted"
    });
    expect(events[1]).toMatchObject({
      type: "result",
      response
    });
  });

  it("rejects lifecycle events whose requestId does not match the active request", async () => {
    const response = createCompletedResponse();
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-other",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      },
      {
        type: "result",
        response
      }
    ];
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    await expect(collectEvents(client.requestStream(createRequest(), transport))).rejects.toThrow(
      "lifecycle event requestId does not match request"
    );
  });

  it("rejects streams whose terminal response provider does not match the expected Agent Card", async () => {
    const response: PredictionResponse = {
      ...createCompletedResponse(),
      provider: {
        id: "provider-2"
      }
    };
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted",
        provider: {
          id: "provider-2"
        }
      },
      {
        type: "result",
        response
      }
    ];
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    await expect(
      collectEvents(client.requestStream(createRequest(), transport, createAgentCard()))
    ).rejects.toThrow("provider id does not match Agent Card identity");
  });

  it("rejects streams whose terminal response requestId does not match the active request", async () => {
    const response: PredictionResponse = {
      ...createCompletedResponse(),
      requestId: "req-other"
    };
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      },
      {
        type: "result",
        response
      }
    ];
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    await expect(collectEvents(client.requestStream(createRequest(), transport))).rejects.toThrow(
      "response requestId does not match request"
    );
  });

  it("rejects streams that end without a terminal result event", async () => {
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      }
    ];
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    await expect(collectEvents(client.requestStream(createRequest(), transport))).rejects.toThrow(
      "ended without a terminal result event"
    );
  });

  it("rejects streams that emit additional events after the terminal result", async () => {
    const response = createCompletedResponse();
    const events: PredictionStreamEvent[] = [
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      },
      {
        type: "result",
        response
      },
      {
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:02Z",
        state: "working"
      }
    ];
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            for (const event of events) {
              controller.enqueue(new TextEncoder().encode(encodeSseEvent(event)));
            }
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    const client = new PredictionClient();
    await expect(collectEvents(client.requestStream(createRequest(), transport))).rejects.toThrow(
      "emitted events after the terminal result"
    );
  });

  it("rejects oversized SSE events before a frame delimiter arrives", async () => {
    const oversizedData = `data: ${"x".repeat(128)}\n`;
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      maxStreamEventBytes: 64,
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(oversizedData));
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    await expect(collectEvents(transport.stream(createRequest()))).rejects.toThrow(
      "stream event exceeded maximum size"
    );
  });

  it("allows multiple bounded SSE events in one chunk", async () => {
    const response = createCompletedResponse();
    const combinedChunk = [
      encodeSseEvent({
        type: "lifecycle",
        requestId: "req-stream-1",
        createdAt: "2026-03-28T12:00:00Z",
        state: "submitted"
      }),
      encodeSseEvent({
        type: "result",
        response
      })
    ].join("");
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      maxStreamEventBytes: 400,
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(combinedChunk));
            controller.close();
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    await expect(collectEvents(transport.stream(createRequest()))).resolves.toHaveLength(2);
  });

  it("times out idle SSE streams", async () => {
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start() {
            // Intentionally leave the stream open without emitting data.
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    await expect(collectEvents(transport.stream(createRequest()))).rejects.toThrow(
      "stream timed out"
    );
  });

  it("supports caller-driven abort for SSE streams", async () => {
    const controller = new AbortController();
    const transport = new HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: async () =>
        new Response(new ReadableStream({
          start() {
            // Intentionally leave the stream open until the caller aborts.
          }
        }), {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        })
    });

    setTimeout(() => controller.abort(), 10);

    await expect(
      collectEvents(
        transport.stream(createRequest(), {
          signal: controller.signal
        })
      )
    ).rejects.toThrow("Prediction transport aborted");
  });
});
