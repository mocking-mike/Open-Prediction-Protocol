import type { PricingOption } from "../types/index.js";
import type { PredictionRequest, PredictionResponse } from "../types/index.js";

export interface RateLimitDecision {
  allowed: boolean;
  reason?: "rate_limit_exceeded" | "spend_limit_exceeded";
  resetAt: string;
  remainingRequests?: number;
  remainingSpend?: number;
}

export interface RateLimitContext {
  request: PredictionRequest;
  provider: PredictionResponse["provider"];
  pricingOption?: PricingOption;
}

export interface RateLimiter {
  check(context: RateLimitContext): Promise<RateLimitDecision> | RateLimitDecision;
}

interface RateLimitState {
  windowStartedAt: number;
  requestCount: number;
  spend: number;
}

export interface InMemoryRateLimiterOptions {
  windowMs: number;
  maxRequestsPerWindow: number;
  maxSpendPerWindow?: number;
  keyFn?: (request: PredictionRequest) => string;
  now?: () => number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly maxSpendPerWindow: number | undefined;
  private readonly keyFn: (request: PredictionRequest) => string;
  private readonly now: () => number;
  private readonly buckets = new Map<string, RateLimitState>();
  private checkCount = 0;

  constructor(options: InMemoryRateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequestsPerWindow = options.maxRequestsPerWindow;
    this.maxSpendPerWindow = options.maxSpendPerWindow;
    this.keyFn =
      options.keyFn ??
      ((request) => request.consumer.did ?? request.consumer.id);
    this.now = options.now ?? Date.now;
  }

  check(context: RateLimitContext): RateLimitDecision {
    this.maybeSweepExpiredBuckets();

    const key = this.keyFn(context.request);
    const currentTime = this.now();
    const existing = this.buckets.get(key);
    const state =
      existing && currentTime - existing.windowStartedAt < this.windowMs
        ? existing
        : {
            windowStartedAt: currentTime,
            requestCount: 0,
            spend: 0
          };

    const requestCost = context.pricingOption?.amount ?? 0;
    const nextRequestCount = state.requestCount + 1;
    const nextSpend = state.spend + requestCost;
    const resetAt = new Date(state.windowStartedAt + this.windowMs).toISOString();

    if (nextRequestCount > this.maxRequestsPerWindow) {
      return {
        allowed: false,
        reason: "rate_limit_exceeded",
        resetAt,
        remainingRequests: 0,
        ...(this.maxSpendPerWindow != null
          ? {
              remainingSpend: Math.max(0, this.maxSpendPerWindow - state.spend)
            }
          : {})
      };
    }

    if (this.maxSpendPerWindow != null && nextSpend > this.maxSpendPerWindow) {
      return {
        allowed: false,
        reason: "spend_limit_exceeded",
        resetAt,
        remainingRequests: Math.max(0, this.maxRequestsPerWindow - state.requestCount),
        remainingSpend: Math.max(0, this.maxSpendPerWindow - state.spend)
      };
    }

    this.buckets.set(key, {
      windowStartedAt: state.windowStartedAt,
      requestCount: nextRequestCount,
      spend: nextSpend
    });

    return {
      allowed: true,
      resetAt,
      remainingRequests: Math.max(0, this.maxRequestsPerWindow - nextRequestCount),
      ...(this.maxSpendPerWindow != null
        ? {
            remainingSpend: Math.max(0, this.maxSpendPerWindow - nextSpend)
          }
        : {})
      };
  }

  private maybeSweepExpiredBuckets(): void {
    this.checkCount += 1;
    if (this.checkCount % 100 !== 0) {
      return;
    }

    const expirationThreshold = this.now() - this.windowMs;
    for (const [key, state] of this.buckets.entries()) {
      if (state.windowStartedAt <= expirationThreshold) {
        this.buckets.delete(key);
      }
    }
  }
}
