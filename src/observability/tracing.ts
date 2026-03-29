import { randomUUID } from "node:crypto";

export type TraceAttributeValue = string | number | boolean;
export type TraceAttributes = Record<string, TraceAttributeValue>;

export interface TraceEvent {
  name: string;
  attributes?: TraceAttributes;
  at: string;
}

export interface RecordedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  status: "ok" | "error";
  startedAt: string;
  endedAt?: string;
  attributes: TraceAttributes;
  events: TraceEvent[];
}

export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  setAttribute(key: string, value: TraceAttributeValue): void;
  addEvent(name: string, attributes?: TraceAttributes): void;
  end(status?: "ok" | "error"): void;
}

export interface Tracer {
  startSpan(
    name: string,
    attributes?: TraceAttributes,
    options?: {
      parent?: TraceSpan;
    }
  ): TraceSpan;
}

export class NoopTraceSpan implements TraceSpan {
  readonly traceId = "noop-trace";
  readonly spanId = "noop-span";

  setAttribute(_key: string, _value: TraceAttributeValue): void {}

  addEvent(_name: string, _attributes?: TraceAttributes): void {}

  end(_status: "ok" | "error" = "ok"): void {}
}

export class NoopTracer implements Tracer {
  startSpan(
    _name: string,
    _attributes: TraceAttributes = {},
    _options: { parent?: TraceSpan } = {}
  ): TraceSpan {
    return new NoopTraceSpan();
  }
}

export class InMemorySpanExporter implements Tracer {
  readonly spans: RecordedSpan[] = [];

  startSpan(
    name: string,
    attributes: TraceAttributes = {},
    options: { parent?: TraceSpan } = {}
  ): TraceSpan {
    const parent = options.parent;
    const recordedSpan: RecordedSpan = {
      traceId: parent?.traceId ?? randomUUID(),
      spanId: randomUUID(),
      ...(parent ? { parentSpanId: parent.spanId } : {}),
      name,
      status: "ok",
      startedAt: new Date().toISOString(),
      attributes: { ...attributes },
      events: []
    };
    this.spans.push(recordedSpan);

    return new InMemoryTraceSpan(recordedSpan);
  }
}

export interface WithSpanOptions {
  parent?: TraceSpan;
}

export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: TraceAttributes,
  fn: (span: TraceSpan) => Promise<T> | T,
  options: WithSpanOptions = {}
): Promise<T> {
  const span = tracer.startSpan(name, attributes, options);

  try {
    const result = await fn(span);
    span.end("ok");
    return result;
  } catch (error) {
    span.addEvent("exception", {
      "exception.message": error instanceof Error ? error.message : String(error),
      "exception.type": error instanceof Error ? error.name : typeof error
    });
    span.end("error");
    throw error;
  }
}

class InMemoryTraceSpan implements TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  private readonly recordedSpan: RecordedSpan;
  private ended = false;

  constructor(recordedSpan: RecordedSpan) {
    this.recordedSpan = recordedSpan;
    this.traceId = recordedSpan.traceId;
    this.spanId = recordedSpan.spanId;
    if (recordedSpan.parentSpanId) {
      this.parentSpanId = recordedSpan.parentSpanId;
    }
  }

  readonly parentSpanId?: string;

  setAttribute(key: string, value: TraceAttributeValue): void {
    this.recordedSpan.attributes[key] = value;
  }

  addEvent(name: string, attributes?: TraceAttributes): void {
    this.recordedSpan.events.push({
      name,
      ...(attributes ? { attributes: { ...attributes } } : {}),
      at: new Date().toISOString()
    });
  }

  end(status: "ok" | "error" = "ok"): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.recordedSpan.status = status;
    this.recordedSpan.endedAt = new Date().toISOString();
  }
}
