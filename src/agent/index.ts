import { randomUUID } from "node:crypto";

import type { PaymentProvider } from "../payments/index.js";
import type { NegotiatedPayment } from "../payments/index.js";
import { PaymentNegotiator } from "../payments/negotiator.js";
import type { DidKeyIdentity } from "../security/identity.js";
import { signPredictionResponse } from "../security/identity.js";
import type { RateLimiter } from "../security/rate-limiter.js";
import {
  assertValidPredictionRequest,
  assertValidPredictionResponse
} from "../schemas/index.js";
import type {
  AgentIdentity,
  Forecast,
  PredictionRequest,
  PredictionResponse,
  PredictionStreamEvent,
  PricingOption
} from "../types/index.js";

export interface PredictionHandlerResult {
  forecast: Forecast;
  freshness?: PredictionResponse["freshness"];
  provenance?: PredictionResponse["provenance"];
  signature?: PredictionResponse["signature"];
  audit?: PredictionResponse["audit"];
}

export interface PredictionHandlerContext {
  signal?: AbortSignal;
}

export interface PredictionAgentOptions {
  provider: PredictionResponse["provider"];
  handler: (
    request: PredictionRequest,
    context: PredictionHandlerContext
  ) => Promise<PredictionHandlerResult> | PredictionHandlerResult;
  pricing?: {
    options: PricingOption[];
  };
  paymentProviders?: PaymentProvider[];
  identity?: Pick<DidKeyIdentity, "did" | "privateKey">;
  rateLimiter?: RateLimiter;
}

export class PredictionAgent {
  readonly provider: PredictionResponse["provider"];
  readonly handler: PredictionAgentOptions["handler"];
  readonly pricing?: PredictionAgentOptions["pricing"];
  readonly paymentProviders: PaymentProvider[];
  readonly identity?: PredictionAgentOptions["identity"];
  readonly rateLimiter: RateLimiter | undefined;

  constructor(options: PredictionAgentOptions) {
    this.provider = options.provider;
    this.handler = options.handler;
    this.pricing = options.pricing;
    this.paymentProviders = options.paymentProviders ?? [];
    this.identity = options.identity;
    this.rateLimiter = options.rateLimiter;
  }

  async *streamRequest(
    request: unknown,
    context: PredictionHandlerContext = {}
  ): AsyncGenerator<PredictionStreamEvent, void, void> {
    assertValidPredictionRequest(request);
    throwIfAborted(context.signal);

    yield {
      type: "lifecycle",
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      state: "submitted",
      provider: this.getProviderIdentity()
    };

    yield {
      type: "lifecycle",
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      state: "working",
      provider: this.getProviderIdentity()
    };

    if (context.signal?.aborted) {
      return;
    }

    let response: PredictionResponse;
    try {
      response = await this.handleRequest(request, context);
    } catch (error) {
      if (isAbortError(error) || context.signal?.aborted) {
        return;
      }
      throw error;
    }

    if (context.signal?.aborted) {
      return;
    }

    yield {
      type: "result",
      response
    };
  }

  async handleRequest(
    request: unknown,
    context: PredictionHandlerContext = {}
  ): Promise<PredictionResponse> {
    assertValidPredictionRequest(request);
    throwIfAborted(context.signal);

    try {
      const negotiatedPayment = this.selectPayment(request);
      await this.applyRateLimitIfConfigured(request, negotiatedPayment);
      await this.authorizePaymentIfNeeded(request, negotiatedPayment);
      throwIfAborted(context.signal);
      const result = await this.handler(request, context);
      throwIfAborted(context.signal);
      const response: PredictionResponse = {
        responseId: randomUUID(),
        requestId: request.requestId,
        status: "completed",
        createdAt: new Date().toISOString(),
        provider: this.getProviderIdentity(),
        forecast: result.forecast,
        ...((result.freshness || this.identity)
          ? {
              freshness: {
                timestamp: new Date().toISOString(),
                nonce: randomUUID(),
                ...(request.consumer.did ? { recipientDid: request.consumer.did } : {}),
                ...(result.freshness ?? {})
              }
            }
          : {}),
        ...(result.provenance ? { provenance: result.provenance } : {}),
        ...(result.audit ? { audit: result.audit } : {})
      };

      if (result.signature) {
        response.signature = result.signature;
      } else if (this.identity) {
        const signature = signPredictionResponse(response, this.identity);
        response.signature = {
          alg: signature.alg,
          value: signature.value
        };
      }

      assertValidPredictionResponse(response);
      return response;
    } catch (error) {
      if (isAbortError(error) || context.signal?.aborted) {
        throw createAbortError();
      }

      const message = error instanceof Error ? error.message : "Prediction handler failed";
      const response: PredictionResponse = {
        responseId: randomUUID(),
        requestId: request.requestId,
        status: "failed",
        createdAt: new Date().toISOString(),
        provider: this.getProviderIdentity(),
        error: {
          code: "prediction_failed",
          message
        }
      };

      assertValidPredictionResponse(response);
      return response;
    }
  }

  private selectPayment(request: PredictionRequest): NegotiatedPayment | undefined {
    if (!this.pricing?.options.length) {
      return undefined;
    }

    const negotiator = new PaymentNegotiator({
      pricingOptions: this.pricing.options,
      paymentProviders: this.paymentProviders
    });
    const negotiated = negotiator.negotiate(request.payment?.preferredMethod);

    if (!negotiated) {
      const preferredMethod = request.payment?.preferredMethod;
      if (preferredMethod) {
        throw new Error(`No payment provider configured for method: ${preferredMethod}`);
      }

      throw new Error("No compatible payment provider configured");
    }

    return negotiated;
  }

  private async authorizePaymentIfNeeded(
    request: PredictionRequest,
    negotiated: NegotiatedPayment | undefined
  ): Promise<void> {
    if (!negotiated) {
      return;
    }

    const resolution = await negotiated.provider.authorize({
      option: negotiated.option,
      request
    });
    if (!resolution.authorized) {
      throw new Error(`Payment authorization failed for method: ${negotiated.option.method}`);
    }
  }

  private async applyRateLimitIfConfigured(
    request: PredictionRequest,
    negotiated: NegotiatedPayment | undefined
  ): Promise<void> {
    if (!this.rateLimiter) {
      return;
    }

    const decision = await this.rateLimiter.check({
      request,
      provider: this.provider,
      ...(negotiated ? { pricingOption: negotiated.option } : {})
    });

    if (!decision.allowed) {
      const suffix =
        decision.reason === "spend_limit_exceeded"
          ? "Spend limit exceeded"
          : "Rate limit exceeded";
      throw new Error(`${suffix}; reset at ${decision.resetAt}`);
    }
  }

  private getProviderIdentity(): AgentIdentity {
    if (this.identity?.did) {
      return {
        ...this.provider,
        did: this.identity.did
      };
    }

    return this.provider;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("Prediction request aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}
