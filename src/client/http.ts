import type { PredictionRequest, PredictionResponse, PredictionStreamEvent } from "../types/index.js";
import {
  TransportOperationController,
  awaitWithSignal,
  readBodyText
} from "./transport-utils.js";
import type { PredictionStreamingTransport, PredictionTransportRequestOptions } from "./index.js";

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: PredictionResponse;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface HttpPredictionTransportOptions {
  baseUrl: string;
  endpoint?: string;
  streamEndpoint?: string;
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
  maxStreamEventBytes?: number;
  requestTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_MAX_STREAM_EVENT_BYTES = 65_536;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120_000;

export class HttpPredictionTransport implements PredictionStreamingTransport {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly streamEndpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxResponseBytes: number;
  private readonly maxStreamEventBytes: number;
  private readonly requestTimeoutMs: number;
  private readonly streamIdleTimeoutMs: number;

  constructor(options: HttpPredictionTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = options.endpoint ?? "/rpc";
    this.streamEndpoint = options.streamEndpoint ?? this.endpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.maxStreamEventBytes = options.maxStreamEventBytes ?? DEFAULT_MAX_STREAM_EVENT_BYTES;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  }

  async send(
    request: PredictionRequest,
    transportOptions: PredictionTransportRequestOptions = {}
  ): Promise<PredictionResponse> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "predictions.request",
      params: request
    };

    const controller = new TransportOperationController(transportOptions.signal);
    controller.configureTimeout(
      this.requestTimeoutMs,
      `Prediction transport request timed out after ${this.requestTimeoutMs}ms`
    );

    try {
      const response = await awaitWithSignal(
        this.fetchImpl(`${this.baseUrl}${this.endpoint}`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(rpcRequest),
          signal: controller.signal
        }),
        controller.signal
      );
      const payloadText = await readBodyText(response, {
        controller,
        maxBytes: this.maxResponseBytes,
        sizeExceededMessage: `Prediction transport response body exceeded maximum size of ${this.maxResponseBytes} bytes`
      });
      const payload = JSON.parse(payloadText) as JsonRpcResponse;
      assertMatchingJsonRpcResponseId(payload.id, request.requestId);

      if ("error" in payload) {
        throw new Error(payload.error.message);
      }

      return payload.result;
    } finally {
      controller.dispose();
    }
  }

  async *stream(
    request: PredictionRequest,
    transportOptions: PredictionTransportRequestOptions = {}
  ): AsyncGenerator<PredictionStreamEvent, void, void> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "tasks/sendSubscribe",
      params: request
    };

    const controller = new TransportOperationController(transportOptions.signal);
    controller.configureTimeout(
      this.requestTimeoutMs,
      `Prediction transport request timed out after ${this.requestTimeoutMs}ms`
    );

    try {
      const response = await awaitWithSignal(
        this.fetchImpl(`${this.baseUrl}${this.streamEndpoint}`, {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json"
          },
          body: JSON.stringify(rpcRequest),
          signal: controller.signal
        }),
        controller.signal
      );

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payloadText = await readBodyText(response, {
          controller,
          maxBytes: this.maxResponseBytes,
          sizeExceededMessage: `Prediction transport response body exceeded maximum size of ${this.maxResponseBytes} bytes`
        });
        const payload = JSON.parse(payloadText) as JsonRpcResponse;
        assertMatchingJsonRpcResponseId(payload.id, request.requestId);
        if ("error" in payload) {
          throw new Error(payload.error.message);
        }

        throw new Error("Expected an event stream response");
      }

      if (!contentType.includes("text/event-stream")) {
        throw new Error(`Unexpected stream content type: ${contentType || "unknown"}`);
      }

      if (!response.body) {
        throw new Error("Event stream response did not include a body");
      }

      controller.configureTimeout(
        this.streamIdleTimeoutMs,
        `Prediction transport stream timed out after ${this.streamIdleTimeoutMs}ms of inactivity`
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await awaitWithSignal(reader.read(), controller.signal, () => {
            void reader.cancel();
          });
          if (done) {
            break;
          }

          controller.resetTimeout();
          buffer += decoder.decode(value, { stream: true });
          const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
          const frames = normalizedBuffer.split("\n\n");
          buffer = frames.pop() ?? "";
          if (utf8ByteLength(buffer) > this.maxStreamEventBytes) {
            void reader.cancel();
            throw new Error(
              `Prediction transport stream event exceeded maximum size of ${this.maxStreamEventBytes} bytes`
            );
          }

          for (const frame of frames) {
            if (utf8ByteLength(frame) > this.maxStreamEventBytes) {
              void reader.cancel();
              throw new Error(
                `Prediction transport stream event exceeded maximum size of ${this.maxStreamEventBytes} bytes`
              );
            }

            const event = parseSseFrame(frame);
            if (event) {
              yield event;
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore release failures during cancellation paths.
        }
      }

      buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
      if (utf8ByteLength(buffer) > this.maxStreamEventBytes) {
        throw new Error(
          `Prediction transport stream event exceeded maximum size of ${this.maxStreamEventBytes} bytes`
        );
      }
      const trailingFrame = parseSseFrame(buffer);
      if (trailingFrame) {
        yield trailingFrame;
      }
    } finally {
      controller.dispose();
    }
  }
}

function parseSseFrame(frame: string): PredictionStreamEvent | undefined {
  const trimmed = frame.trim();
  if (!trimmed) {
    return undefined;
  }

  const dataLines: string[] = [];
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return undefined;
  }

  return JSON.parse(dataLines.join("\n")) as PredictionStreamEvent;
}

function assertMatchingJsonRpcResponseId(id: string | number | null, requestId: string): void {
  if (id !== requestId) {
    throw new Error(`JSON-RPC response id does not match request: ${String(id)}`);
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
