import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { InMemoryRateLimiter } from "../src/security/rate-limiter.js";
import type { PredictionRequest } from "../src/types/index.js";

const request: PredictionRequest = {
  requestId: "req-1",
  createdAt: "2026-03-28T12:00:00Z",
  consumer: {
    id: "consumer-1"
  },
  prediction: {
    domain: "weather.precipitation",
    question: "Will it rain?",
    horizon: "24h",
    desiredOutput: "binary-probability"
  }
};

describe("InMemoryRateLimiter", () => {
  it("blocks requests after the configured request limit", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter({
      windowMs: 60_000,
      maxRequestsPerWindow: 2,
      now: () => now
    });

    expect(
      limiter.check({
        request,
        provider: { id: "provider-1" }
      }).allowed
    ).toBe(true);
    expect(
      limiter.check({
        request,
        provider: { id: "provider-1" }
      }).allowed
    ).toBe(true);

    const blocked = limiter.check({
      request,
      provider: { id: "provider-1" }
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("rate_limit_exceeded");

    now += 60_001;

    expect(
      limiter.check({
        request,
        provider: { id: "provider-1" }
      }).allowed
    ).toBe(true);
  });

  it("blocks requests that exceed the configured spend cap", () => {
    const limiter = new InMemoryRateLimiter({
      windowMs: 60_000,
      maxRequestsPerWindow: 10,
      maxSpendPerWindow: 5
    });

    expect(
      limiter.check({
        request,
        provider: { id: "provider-1" },
        pricingOption: {
          method: "free",
          model: "free"
        }
      }).allowed
    ).toBe(true);

    expect(
      limiter.check({
        request,
        provider: { id: "provider-1" },
        pricingOption: {
          method: "x402",
          model: "per-request",
          amount: 3
        }
      }).allowed
    ).toBe(true);

    const blocked = limiter.check({
      request,
      provider: { id: "provider-1" },
      pricingOption: {
        method: "x402",
        model: "per-request",
        amount: 3
      }
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("spend_limit_exceeded");
  });

  it("evicts stale buckets during periodic sweeps", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter({
      windowMs: 60_000,
      maxRequestsPerWindow: 1,
      now: () => now
    });

    expect(
      limiter.check({
        request: {
          ...request,
          consumer: {
            id: "consumer-a"
          }
        },
        provider: { id: "provider-1" }
      }).allowed
    ).toBe(true);

    now += 60_001;

    for (let index = 0; index < 99; index += 1) {
      limiter.check({
        request: {
          ...request,
          requestId: `req-sweep-${index}`,
          consumer: {
            id: `consumer-${index}`
          }
        },
        provider: { id: "provider-1" }
      });
    }

    expect(
      limiter.check({
        request: {
          ...request,
          requestId: "req-a-2",
          consumer: {
            id: "consumer-a"
          }
        },
        provider: { id: "provider-1" }
      }).allowed
    ).toBe(true);
  });
});

describe("PredictionAgent rate limiting", () => {
  it("returns a failed response when request volume exceeds the configured limit", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      rateLimiter: new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequestsPerWindow: 1
      }),
      handler: () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.4
        }
      })
    });

    const first = await agent.handleRequest(request);
    const second = await agent.handleRequest({
      ...request,
      requestId: "req-2"
    });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("failed");
    if (second.status !== "failed") {
      throw new Error("Expected failed response");
    }
    expect(second.error.message).toBe("Prediction request rate limited");
  });

  it("applies spend caps before payment authorization", async () => {
    const authorize = () => {
      throw new Error("authorization should not be called when rate limited");
    };

    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [
          {
            method: "x402",
            model: "per-request",
            amount: 5
          }
        ]
      },
      paymentProviders: [
        {
          method: "x402",
          authorize
        }
      ],
      rateLimiter: new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequestsPerWindow: 10,
        maxSpendPerWindow: 4
      }),
      handler: () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.4
        }
      })
    });

    const response = await agent.handleRequest({
      ...request,
      payment: {
        preferredMethod: "x402"
      }
    });

    expect(response.status).toBe("failed");
    if (response.status !== "failed") {
      throw new Error("Expected failed response");
    }
    expect(response.error.message).toBe("Prediction request rate limited");
  });
});
