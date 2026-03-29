import {
  assertValidAgentCard,
  assertValidPredictionRequest,
  assertValidPredictionResponse
} from "../schemas/index.js";
import { verifyPredictionResponseSignature } from "../security/identity.js";
import type { AgentCard, PredictionRequest, PredictionResponse } from "../types/index.js";

export interface PredictionTransport {
  send(request: PredictionRequest): Promise<unknown> | unknown;
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

  async request(
    request: PredictionRequest,
    transport: PredictionTransport
  ): Promise<PredictionResponse> {
    this.validateRequest(request);
    const response = await transport.send(request);
    return this.validateResponse(response);
  }
}

export * from "./http.js";
export * from "./x402.js";
export * from "./aggregator.js";
