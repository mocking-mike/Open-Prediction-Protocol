import { describe, expect, it } from "vitest";

import {
  InMemoryLogSink,
  createCorrelationId,
  createLogger
} from "../src/observability/logger.js";

describe("observability logger", () => {
  it("creates correlation ids", () => {
    const first = createCorrelationId();
    const second = createCorrelationId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(second).not.toBe(first);
  });

  it("writes structured log records to the sink", () => {
    const sink = new InMemoryLogSink();
    const logger = createLogger({
      sink,
      context: {
        component: "prediction-agent",
        correlationId: "corr-1"
      }
    });

    logger.info("prediction.completed", {
      requestId: "req-1",
      providerId: "provider-1"
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      level: "info",
      message: "prediction.completed",
      context: {
        component: "prediction-agent",
        correlationId: "corr-1",
        requestId: "req-1",
        providerId: "provider-1"
      }
    });
    expect(sink.records[0]?.timestamp).toBeDefined();
  });

  it("supports child loggers that inherit and extend context", () => {
    const sink = new InMemoryLogSink();
    const logger = createLogger({
      sink,
      context: {
        component: "prediction-http-server",
        correlationId: "corr-1"
      }
    });

    const child = logger.child({
      requestId: "req-1",
      providerId: "provider-1"
    });

    child.error("prediction.failed", {
      errorCode: "prediction_failed"
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      level: "error",
      message: "prediction.failed",
      context: {
        component: "prediction-http-server",
        correlationId: "corr-1",
        requestId: "req-1",
        providerId: "provider-1",
        errorCode: "prediction_failed"
      }
    });
  });
});
