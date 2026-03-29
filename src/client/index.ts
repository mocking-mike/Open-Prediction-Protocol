import {
  assertValidAgentCard,
  assertValidPredictionRequest,
  assertValidPredictionResponse
} from "../schemas/index.js";
import { verifyPredictionResponseSignature } from "../security/identity.js";
import type {
  AgentCard,
  AgentIdentity,
  PredictionRequest,
  PredictionResponse,
  PredictionStreamEvent
} from "../types/index.js";

export interface PredictionTransport {
  send(request: PredictionRequest, options?: PredictionTransportRequestOptions): Promise<unknown> | unknown;
}

export interface PredictionStreamingTransport extends PredictionTransport {
  stream(
    request: PredictionRequest,
    options?: PredictionTransportRequestOptions
  ): AsyncIterable<unknown>;
}

export interface PredictionClientOptions {
  verifySignature?: boolean;
}

export interface PredictionTransportRequestOptions {
  signal?: AbortSignal;
}

export interface PredictionClientRequestOptions extends PredictionTransportRequestOptions {}

interface PredictionValidationContext {
  request?: PredictionRequest;
  agentCard?: AgentCard;
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

  validateResponse(
    response: unknown,
    context: PredictionValidationContext = {}
  ): PredictionResponse {
    assertValidPredictionResponse(response);
    if (context.request) {
      assertResponseMatchesRequest(context.request, response);
    }

    if (context.agentCard) {
      assertProviderMatchesAgentCard(context.agentCard, response.provider, "Prediction response");
    }

    if (this.verifySignature && response.status === "completed" && !verifyPredictionResponseSignature(response)) {
      throw new Error("Prediction response signature verification failed");
    }
    return response;
  }

  validateStreamEvent(
    event: unknown,
    context: PredictionValidationContext = {}
  ): PredictionStreamEvent {
    if (!event || typeof event !== "object" || !("type" in event)) {
      throw new Error("Invalid prediction stream event");
    }

    if (event.type === "lifecycle") {
      const lifecycleEvent = event as Partial<PredictionStreamEvent> & {
        requestId?: unknown;
        createdAt?: unknown;
        state?: unknown;
        provider?: unknown;
      };
      if (
        typeof lifecycleEvent.requestId !== "string" ||
        typeof lifecycleEvent.createdAt !== "string" ||
        (lifecycleEvent.state !== "submitted" && lifecycleEvent.state !== "working")
      ) {
        throw new Error("Invalid prediction lifecycle event");
      }

      if (context.request && lifecycleEvent.requestId !== context.request.requestId) {
        throw new Error(
          `Prediction lifecycle event requestId does not match request: ${lifecycleEvent.requestId}`
        );
      }

      const provider =
        lifecycleEvent.provider === undefined
          ? undefined
          : parseAgentIdentity(lifecycleEvent.provider, "prediction lifecycle event");
      if (provider && context.agentCard) {
        assertProviderMatchesAgentCard(context.agentCard, provider, "Prediction lifecycle event");
      }

      return {
        type: "lifecycle",
        requestId: lifecycleEvent.requestId,
        createdAt: lifecycleEvent.createdAt,
        state: lifecycleEvent.state,
        ...(provider ? { provider } : {})
      };
    }

    if (event.type === "result") {
      const resultEvent = event as { response?: unknown };
      return {
        type: "result",
        response: this.validateResponse(resultEvent.response, context)
      };
    }

    throw new Error("Invalid prediction stream event");
  }

  async request(
    request: PredictionRequest,
    transport: PredictionTransport,
    agentCard?: AgentCard,
    options: PredictionClientRequestOptions = {}
  ): Promise<PredictionResponse> {
    this.validateRequest(request);
    if (agentCard) {
      this.validateAgentCard(agentCard);
    }
    const response = await transport.send(request, options);
    return this.validateResponse(response, {
      request,
      ...(agentCard ? { agentCard } : {})
    });
  }

  async *requestStream(
    request: PredictionRequest,
    transport: PredictionStreamingTransport,
    agentCard?: AgentCard,
    options: PredictionClientRequestOptions = {}
  ): AsyncGenerator<PredictionStreamEvent, void, void> {
    this.validateRequest(request);
    if (agentCard) {
      this.validateAgentCard(agentCard);
    }

    let sawTerminalResult = false;

    for await (const event of transport.stream(request, options)) {
      if (sawTerminalResult) {
        throw new Error("Prediction stream emitted events after the terminal result");
      }

      const validatedEvent = this.validateStreamEvent(event, {
        request,
        ...(agentCard ? { agentCard } : {})
      });
      if (validatedEvent.type === "result") {
        sawTerminalResult = true;
      }

      yield validatedEvent;
    }

    if (!sawTerminalResult) {
      throw new Error("Prediction stream ended without a terminal result event");
    }
  }
}

function assertResponseMatchesRequest(
  request: PredictionRequest,
  response: PredictionResponse
): void {
  if (response.requestId !== request.requestId) {
    throw new Error(`Prediction response requestId does not match request: ${response.requestId}`);
  }

  if (response.status !== "completed") {
    return;
  }

  if (response.forecast.domain !== request.prediction.domain) {
    throw new Error(
      `Prediction response forecast domain does not match request: ${response.forecast.domain}`
    );
  }

  if (response.forecast.horizon !== request.prediction.horizon) {
    throw new Error(
      `Prediction response forecast horizon does not match request: ${response.forecast.horizon}`
    );
  }

  if (response.forecast.type !== request.prediction.desiredOutput) {
    throw new Error(
      `Prediction response forecast type does not match request: ${response.forecast.type}`
    );
  }
}

function assertProviderMatchesAgentCard(
  agentCard: AgentCard,
  provider: AgentIdentity,
  context: string
): void {
  if (agentCard.identity?.id && provider.id !== agentCard.identity.id) {
    throw new Error(`${context} provider id does not match Agent Card identity: ${provider.id}`);
  }

  if (agentCard.identity?.did && provider.did !== agentCard.identity.did) {
    throw new Error(
      `${context} provider DID does not match Agent Card identity DID: ${provider.did ?? "missing"}`
    );
  }
}

function parseAgentIdentity(value: unknown, context: string): AgentIdentity {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid ${context} provider identity`);
  }

  const identity = value as {
    id?: unknown;
    did?: unknown;
  };
  if (typeof identity.id !== "string") {
    throw new Error(`Invalid ${context} provider identity`);
  }

  if (identity.did !== undefined && typeof identity.did !== "string") {
    throw new Error(`Invalid ${context} provider identity`);
  }

  return {
    id: identity.id,
    ...(identity.did ? { did: identity.did } : {})
  };
}

export * from "./http.js";
export * from "./x402.js";
export * from "./aggregator.js";
export * from "./conditional.js";
