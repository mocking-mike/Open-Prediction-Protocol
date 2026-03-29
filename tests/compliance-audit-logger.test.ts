import { describe, expect, it } from "vitest";

import {
  InMemoryComplianceAuditLogger,
  summarizeComplianceAuditEvents
} from "../src/compliance/audit-logger.js";

describe("compliance audit logger", () => {
  it("records structured audit events with correlation and provider metadata", () => {
    const logger = new InMemoryComplianceAuditLogger();

    const event = logger.record({
      eventType: "prediction.request.accepted",
      actor: "consumer",
      requestId: "req-1",
      providerId: "provider-1",
      correlationId: "corr-1",
      details: {
        humanOversightRequired: true,
        riskLevel: "limited"
      }
    });

    expect(event).toMatchObject({
      sequence: 1,
      eventType: "prediction.request.accepted",
      actor: "consumer",
      requestId: "req-1",
      providerId: "provider-1",
      correlationId: "corr-1",
      details: {
        humanOversightRequired: true,
        riskLevel: "limited"
      }
    });
    expect(event.recordedAt).toBeDefined();
  });

  it("filters audit events by request id, provider id, and event type", () => {
    const logger = new InMemoryComplianceAuditLogger();
    logger.record({
      eventType: "prediction.request.accepted",
      actor: "consumer",
      requestId: "req-1",
      providerId: "provider-1"
    });
    logger.record({
      eventType: "prediction.response.reviewed",
      actor: "provider",
      requestId: "req-1",
      providerId: "provider-1"
    });
    logger.record({
      eventType: "prediction.request.rejected",
      actor: "consumer",
      requestId: "req-2",
      providerId: "provider-2"
    });

    expect(
      logger.query({
        requestId: "req-1",
        providerId: "provider-1"
      }).map((event) => event.eventType)
    ).toEqual([
      "prediction.request.accepted",
      "prediction.response.reviewed"
    ]);

    expect(
      logger.query({
        eventType: "prediction.request.rejected"
      }).map((event) => event.requestId)
    ).toEqual(["req-2"]);
  });

  it("returns immutable snapshots and summarizes audit history", () => {
    const logger = new InMemoryComplianceAuditLogger();
    logger.record({
      eventType: "prediction.request.accepted",
      actor: "consumer",
      requestId: "req-1",
      providerId: "provider-1"
    });
    logger.record({
      eventType: "prediction.request.rejected",
      actor: "consumer",
      requestId: "req-2",
      providerId: "provider-2"
    });

    const events = logger.getEvents();
    expect(events).toHaveLength(2);
    const first = events[0];
    if (!first) {
      throw new Error("Missing first audit event");
    }
    first.eventType = "tampered";

    expect(logger.getEvents()[0]?.eventType).toBe("prediction.request.accepted");
    expect(summarizeComplianceAuditEvents(logger.getEvents())).toEqual({
      totalEvents: 2,
      eventTypes: ["prediction.request.accepted", "prediction.request.rejected"],
      providerIds: ["provider-1", "provider-2"]
    });
  });
});
