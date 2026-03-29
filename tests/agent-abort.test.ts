import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import type { PredictionStreamEvent } from "../src/types/index.js";

describe("PredictionAgent abort handling", () => {
  it("propagates abort signals into the handler and stops streaming without a terminal result", async () => {
    const controller = new AbortController();
    let handlerSawAbort = false;
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });

    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      handler: async (_request, context) => {
        notifyStarted?.();
        await new Promise((_resolve, reject) => {
          context.signal?.addEventListener(
            "abort",
            () => {
              handlerSawAbort = true;
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
        throw new Error("unreachable");
      }
    });

    const events: PredictionStreamEvent[] = [];
    const iterator = agent.streamRequest(
      {
        requestId: "req-abort-1",
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
      },
      {
        signal: controller.signal
      }
    );

    const submitted = await iterator.next();
    const working = await iterator.next();
    events.push(submitted.value as PredictionStreamEvent, working.value as PredictionStreamEvent);

    const terminalPromise = iterator.next();
    await started;
    controller.abort();

    const terminal = await terminalPromise;
    expect(handlerSawAbort).toBe(true);
    expect(terminal.done).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "lifecycle",
      state: "submitted"
    });
    expect(events[1]).toMatchObject({
      type: "lifecycle",
      state: "working"
    });
  });

  it("rejects handleRequest with AbortError when execution is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-29T12:00:01Z",
          probability: 0.42
        }
      })
    });

    await expect(
      agent.handleRequest(
        {
          requestId: "req-abort-2",
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
        },
        {
          signal: controller.signal
        }
      )
    ).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});
