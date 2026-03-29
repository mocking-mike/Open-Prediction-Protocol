export type ComplianceAuditActor = "consumer" | "provider" | "scorer" | "system";

export interface ComplianceAuditEvent {
  sequence: number;
  recordedAt: string;
  eventType: string;
  actor: ComplianceAuditActor;
  requestId?: string;
  responseId?: string;
  providerId?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface RecordComplianceAuditEventOptions {
  eventType: string;
  actor: ComplianceAuditActor;
  requestId?: string;
  responseId?: string;
  providerId?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface QueryComplianceAuditEventsOptions {
  eventType?: string;
  requestId?: string;
  responseId?: string;
  providerId?: string;
  correlationId?: string;
}

export interface ComplianceAuditSummary {
  totalEvents: number;
  eventTypes: string[];
  providerIds: string[];
}

export class InMemoryComplianceAuditLogger {
  private readonly events: ComplianceAuditEvent[] = [];

  record(options: RecordComplianceAuditEventOptions): ComplianceAuditEvent {
    const event: ComplianceAuditEvent = {
      sequence: this.events.length + 1,
      recordedAt: new Date().toISOString(),
      eventType: options.eventType,
      actor: options.actor,
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(options.responseId ? { responseId: options.responseId } : {}),
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      ...(options.details ? { details: clone(options.details) } : {})
    };

    this.events.push(event);
    return clone(event);
  }

  getEvents(): ComplianceAuditEvent[] {
    return this.events.map((event) => clone(event));
  }

  query(options: QueryComplianceAuditEventsOptions = {}): ComplianceAuditEvent[] {
    return this.events
      .filter((event) => matchesAuditQuery(event, options))
      .map((event) => clone(event));
  }
}

export function summarizeComplianceAuditEvents(
  events: ComplianceAuditEvent[]
): ComplianceAuditSummary {
  const eventTypes = new Set<string>();
  const providerIds = new Set<string>();

  for (const event of events) {
    eventTypes.add(event.eventType);
    if (event.providerId) {
      providerIds.add(event.providerId);
    }
  }

  return {
    totalEvents: events.length,
    eventTypes: [...eventTypes].sort(),
    providerIds: [...providerIds].sort()
  };
}

function matchesAuditQuery(
  event: ComplianceAuditEvent,
  options: QueryComplianceAuditEventsOptions
): boolean {
  if (options.eventType && event.eventType !== options.eventType) {
    return false;
  }

  if (options.requestId && event.requestId !== options.requestId) {
    return false;
  }

  if (options.responseId && event.responseId !== options.responseId) {
    return false;
  }

  if (options.providerId && event.providerId !== options.providerId) {
    return false;
  }

  if (options.correlationId && event.correlationId !== options.correlationId) {
    return false;
  }

  return true;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
