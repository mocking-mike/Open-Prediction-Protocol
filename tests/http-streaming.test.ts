import { describe, expect, it } from "vitest";

import { PredictionClient } from "../src/client/index.js";
import { HttpPredictionTransport } from "../src/client/http.js";
import type { PredictionRequest, PredictionResponse, PredictionStreamEvent } from "../src/types/index.js";

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

function encodeSseEvent(event: PredictionStreamEvent): string {
  const eventName = event.type === "lifecycle" ? "lifecycle" : "result";
  return `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
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
});
