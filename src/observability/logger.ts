import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogValue = string | number | boolean | null;
export type LogContext = Record<string, LogValue>;

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: LogContext;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export interface StructuredLogger {
  child(context: LogContext): StructuredLogger;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface CreateLoggerOptions {
  sink?: LogSink;
  context?: LogContext;
}

export class InMemoryLogSink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }
}

export class ConsoleJsonLogSink implements LogSink {
  write(record: LogRecord): void {
    console.log(JSON.stringify(record));
  }
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function createLogger(options: CreateLoggerOptions = {}): StructuredLogger {
  const sink = options.sink ?? new ConsoleJsonLogSink();
  const context = options.context ?? {};
  return new DefaultStructuredLogger(sink, context);
}

class DefaultStructuredLogger implements StructuredLogger {
  private readonly sink: LogSink;
  private readonly baseContext: LogContext;

  constructor(sink: LogSink, baseContext: LogContext) {
    this.sink = sink;
    this.baseContext = { ...baseContext };
  }

  child(context: LogContext): StructuredLogger {
    return new DefaultStructuredLogger(this.sink, {
      ...this.baseContext,
      ...context
    });
  }

  debug(message: string, context: LogContext = {}): void {
    this.write("debug", message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.write("info", message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.write("warn", message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context: LogContext): void {
    this.sink.write({
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...this.baseContext,
        ...context
      }
    });
  }
}
