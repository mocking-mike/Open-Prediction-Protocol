import { describe, expect, it } from "vitest";

import {
  InMemorySpanExporter,
  NoopTracer,
  withSpan
} from "../src/observability/tracing.js";

describe("observability tracing", () => {
  it("records a completed span with attributes", async () => {
    const exporter = new InMemorySpanExporter();

    const result = await withSpan(
      exporter,
      "opp.prediction.request",
      {
        "opp.request.id": "req-1",
        "opp.domain": "weather.precipitation"
      },
      async (span) => {
        span.setAttribute("opp.provider.id", "provider-1");
        return "ok";
      }
    );

    expect(result).toBe("ok");
    expect(exporter.spans).toHaveLength(1);
    expect(exporter.spans[0]).toMatchObject({
      name: "opp.prediction.request",
      status: "ok",
      attributes: {
        "opp.request.id": "req-1",
        "opp.domain": "weather.precipitation",
        "opp.provider.id": "provider-1"
      }
    });
    expect(exporter.spans[0]?.endedAt).toBeDefined();
  });

  it("records span errors and rethrows the original exception", async () => {
    const exporter = new InMemorySpanExporter();

    await expect(
      withSpan(exporter, "opp.prediction.request", {}, async () => {
        throw new Error("upstream unavailable");
      })
    ).rejects.toThrow("upstream unavailable");

    expect(exporter.spans).toHaveLength(1);
    expect(exporter.spans[0]).toMatchObject({
      name: "opp.prediction.request",
      status: "error",
      events: [
        {
          name: "exception",
          attributes: {
            "exception.message": "upstream unavailable",
            "exception.type": "Error"
          }
        }
      ]
    });
  });

  it("records nested spans with parent-child relationships", async () => {
    const exporter = new InMemorySpanExporter();

    await withSpan(exporter, "opp.request", {}, async (parentSpan) => {
      await withSpan(
        exporter,
        "opp.handler",
        {},
        async () => "done",
        {
          parent: parentSpan
        }
      );
    });

    expect(exporter.spans).toHaveLength(2);
    const parent = exporter.spans.find((span) => span.name === "opp.request");
    const child = exporter.spans.find((span) => span.name === "opp.handler");

    expect(parent?.spanId).toBeDefined();
    expect(child?.parentSpanId).toBe(parent?.spanId);
  });

  it("supports a no-op tracer", async () => {
    const tracer = new NoopTracer();

    const result = await withSpan(tracer, "opp.noop", {}, async (span) => {
      span.setAttribute("opp.test", true);
      span.addEvent("ignored");
      return 42;
    });

    expect(result).toBe(42);
  });
});
