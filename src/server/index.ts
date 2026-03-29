import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { PredictionAgent } from "../agent/index.js";
import type { PredictionPublicErrorEvent, PredictionPublicErrorOptions } from "../errors/public.js";
import {
  reportPredictionPublicError,
  resolvePredictionPublicErrorMessage
} from "../errors/public.js";
import { SchemaValidationError, assertValidAgentCard } from "../schemas/index.js";
import type { AgentCard, PredictionStreamEvent } from "../types/index.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

const MAX_REQUEST_BODY_BYTES = 1_048_576;

export interface PredictionHttpServerOptions {
  agentCard: AgentCard;
  predictionAgent: PredictionAgent;
  exposeErrorDetails?: PredictionPublicErrorOptions["exposeErrorDetails"];
  errorReporter?: PredictionPublicErrorOptions["errorReporter"];
}

export class PredictionHttpServer {
  private readonly agentCard: AgentCard;
  private readonly predictionAgent: PredictionAgent;
  private readonly exposeErrorDetails: boolean;
  private readonly errorReporter?: PredictionHttpServerOptions["errorReporter"];
  private server: Server | undefined;

  constructor(options: PredictionHttpServerOptions) {
    assertValidAgentCard(options.agentCard);
    this.agentCard = options.agentCard;
    this.predictionAgent = options.predictionAgent;
    this.exposeErrorDetails = options.exposeErrorDetails ?? false;
    this.errorReporter = options.errorReporter;
  }

  async listen(port = 0, host = "127.0.0.1"): Promise<{ port: number; host: string }> {
    if (this.server) {
      throw new Error("Server is already listening");
    }

    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, host, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine listening address");
    }

    return { port: address.port, host: address.address };
  }

  async close(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.server = undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === "GET" && request.url === "/.well-known/agent.json") {
      this.sendJson(response, 200, this.agentCard);
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      this.sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "POST" && request.url === "/rpc") {
      await this.handleRpc(request, response);
      return;
    }

    this.sendJson(response, 404, {
      error: {
        code: "not_found",
        message: "Route not found"
      }
    });
  }

  private async handleRpc(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let payload: JsonRpcRequest;

    try {
      payload = (await this.readJson(request)) as JsonRpcRequest;
    } catch {
      this.sendJson(response, 400, this.rpcError(null, -32700, "Invalid JSON"));
      return;
    }

    if (payload?.jsonrpc !== "2.0" || typeof payload.method !== "string") {
      this.sendJson(response, 400, this.rpcError(payload?.id ?? null, -32600, "Invalid JSON-RPC request"));
      return;
    }

    if (payload.method === "tasks/sendSubscribe") {
      await this.handleSse(request, response, payload);
      return;
    }

    if (payload.method !== "predictions.request") {
      this.sendJson(response, 404, this.rpcError(payload.id ?? null, -32601, "Method not found"));
      return;
    }

    try {
      const result = await this.predictionAgent.handleRequest(payload.params);
      this.sendJson(response, 200, this.rpcSuccess(payload.id ?? null, result));
    } catch (error) {
      const category = classifyJsonRpcError(error);
      const message = resolvePredictionPublicErrorMessage(
        error,
        category,
        this.exposeErrorDetails
      );
      const event: PredictionPublicErrorEvent = {
        error,
        surface: "json-rpc",
        category,
        publicMessage: message,
        method: payload.method
      };
      const requestId = normalizeRequestId(payload.id);
      if (requestId) {
        event.requestId = requestId;
      }
      if (this.agentCard.identity?.id) {
        event.providerId = this.agentCard.identity.id;
      }
      this.reportPublicError(event);
      this.sendJson(response, 400, this.rpcError(payload.id ?? null, -32000, message));
    }
  }

  private async handleSse(
    request: IncomingMessage,
    response: ServerResponse,
    payload: JsonRpcRequest
  ): Promise<void> {
    const abortController = new AbortController();
    const abortStream = () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };

    request.once("aborted", abortStream);
    request.once("close", abortStream);
    response.once("close", abortStream);

    try {
      const stream = this.predictionAgent.streamRequest(payload.params, {
        signal: abortController.signal
      });
      const iterator = stream[Symbol.asyncIterator]();

      try {
        const firstEvent = await iterator.next();
        if (abortController.signal.aborted) {
          response.end();
          return;
        }

        response.statusCode = 200;
        response.setHeader("cache-control", "no-cache, no-transform");
        response.setHeader("connection", "keep-alive");
        response.setHeader("content-type", "text/event-stream; charset=utf-8");
        response.flushHeaders();

        if (!firstEvent.done) {
          response.write(this.serializeSseEvent(firstEvent.value));
        }

        while (true) {
          const nextEvent = await iterator.next();
          if (nextEvent.done) {
            break;
          }

          if (abortController.signal.aborted) {
            break;
          }
          response.write(this.serializeSseEvent(nextEvent.value));
        }
      } finally {
        await iterator.return?.();
      }

      if (!abortController.signal.aborted) {
        response.end();
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        response.end();
        return;
      }

      const category = classifyJsonRpcError(error);
      const message = resolvePredictionPublicErrorMessage(
        error,
        category,
        this.exposeErrorDetails
      );
      const event: PredictionPublicErrorEvent = {
        error,
        surface: "json-rpc",
        category,
        publicMessage: message,
        method: payload.method
      };
      const requestId = normalizeRequestId(payload.id);
      if (requestId) {
        event.requestId = requestId;
      }
      if (this.agentCard.identity?.id) {
        event.providerId = this.agentCard.identity.id;
      }
      this.reportPublicError(event);

      if (response.headersSent) {
        response.end();
        return;
      }

      this.sendJson(response, 400, this.rpcError(payload.id ?? null, -32000, message));
    } finally {
      request.off("aborted", abortStream);
      request.off("close", abortStream);
      response.off("close", abortStream);
    }
  }

  private async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of request) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      totalBytes += buffer.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        throw new Error("Request body too large");
      }

      chunks.push(buffer);
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(raw);
  }

  private rpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  private rpcError(id: string | number | null, code: number, message: string): JsonRpcFailure {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    };
  }

  private sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
  }

  private serializeSseEvent(event: PredictionStreamEvent): string {
    const eventName = event.type === "lifecycle" ? "lifecycle" : "result";
    return `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
  }

  private reportPublicError(event: PredictionPublicErrorEvent): void {
    reportPredictionPublicError(this.errorReporter, event);
  }
}

export * from "./x402-express.js";

function classifyJsonRpcError(error: unknown): "validation" | "internal" {
  return error instanceof SchemaValidationError ? "validation" : "internal";
}

function normalizeRequestId(id: string | number | null | undefined): string | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }

  return String(id);
}
