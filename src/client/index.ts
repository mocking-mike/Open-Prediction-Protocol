import {
  assertValidAgentCard,
  assertValidPredictionRequest,
  assertValidPredictionResponse
} from "../schemas/index.js";
import { verifyPredictionResponseSignature } from "../security/identity.js";
import type {
  AgentCard,
  PredictionRequest,
  PredictionResponse,
  PredictionStreamEvent
} from "../types/index.js";

export interface PredictionTransport {
  send(request: PredictionRequest): Promise<unknown> | unknown;
}

export interface PredictionStreamingTransport extends PredictionTransport {
  stream(request: PredictionRequest): AsyncIterable<unknown>;
}

export interface PredictionClientOptions {
  verifySignature?: boolean;
}

export class PredictionClient {
  private readonly verifySignature: boolean;

  constructor(options: PredictionClientOptions = {}) {
    this.verifySignature = options.verifySignature ?? false;
  }

  validateAgentCard(agentCard: unknown): AgentCard {
    assertValidAgentCard(agentCard);
    return agentCard;
  }

  validateRequest(request: unknown): PredictionRequest {
    assertValidPredictionRequest(request);
    return request;
  }

  validateResponse(response: unknown): PredictionResponse {
    assertValidPredictionResponse(response);
    if (this.verifySignature && response.status === "completed" && !verifyPredictionResponseSignature(response)) {
      throw new Error("Prediction response signature verification failed");
    }
    return response;
  }

  validateStreamEvent(event: unknown): PredictionStreamEvent {
    if (!event || typeof event !== "object" || !("type" in event)) {
      throw new Error("Invalid prediction stream event");
    }

    if (event.type === "lifecycle") {
      const lifecycleEvent = event as Partial<PredictionStreamEvent> & {
        requestId?: unknown;
        createdAt?: unknown;
        state?: unknown;
      };
      if (
        typeof lifecycleEvent.requestId !== "string" ||
        typeof lifecycleEvent.createdAt !== "string" ||
        (lifecycleEvent.state !== "submitted" && lifecycleEvent.state !== "working")
      ) {
        throw new Error("Invalid prediction lifecycle event");
      }

      return lifecycleEvent as PredictionStreamEvent;
    }

    if (event.type === "result") {
      const resultEvent = event as { response?: unknown };
      return {
        type: "result",
        response: this.validateResponse(resultEvent.response)
      };
    }

    throw new Error("Invalid prediction stream event");
  }

  async request(
    request: PredictionRequest,
    transport: PredictionTransport
  ): Promise<PredictionResponse> {
    this.validateRequest(request);
    const response = await transport.send(request);
    return this.validateResponse(response);
  }

  async *requestStream(
    request: PredictionRequest,
    transport: PredictionStreamingTransport
  ): AsyncGenerator<PredictionStreamEvent, void, void> {
    this.validateRequest(request);

    for await (const event of transport.stream(request)) {
      yield this.validateStreamEvent(event);
    }
  }
}

export * from "./http.js";
export * from "./x402.js";
export * from "./aggregator.js";
export * from "./conditional.js";
