import type { PredictionRequest, PredictionResponse, PredictionStreamEvent } from "../types/index.js";
import type { PredictionStreamingTransport } from "./index.js";

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
}

export class HttpPredictionTransport implements PredictionStreamingTransport {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly streamEndpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpPredictionTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = options.endpoint ?? "/rpc";
    this.streamEndpoint = options.streamEndpoint ?? this.endpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(request: PredictionRequest): Promise<PredictionResponse> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "predictions.request",
      params: request
    };

    const response = await this.fetchImpl(`${this.baseUrl}${this.endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(rpcRequest)
    });

    const payload = (await response.json()) as JsonRpcResponse;

    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    return payload.result;
  }

  async *stream(request: PredictionRequest): AsyncGenerator<PredictionStreamEvent, void, void> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "tasks/sendSubscribe",
      params: request
    };

    const response = await this.fetchImpl(`${this.baseUrl}${this.streamEndpoint}`, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify(rpcRequest)
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as JsonRpcResponse;
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
      const frames = normalizedBuffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (event) {
          yield event;
        }
      }
    }

    buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
    const trailingFrame = parseSseFrame(buffer);
    if (trailingFrame) {
      yield trailingFrame;
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
