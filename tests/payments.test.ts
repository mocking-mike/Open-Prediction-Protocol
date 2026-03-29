import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import {
  FreePaymentProvider,
  PaymentNegotiator,
  StripePaymentProvider,
  X402PaymentProvider,
  findPricingOption,
  negotiatePayment
} from "../src/payments/index.js";
import type { PricingOption } from "../src/types/index.js";

function createRequest(preferredMethod: "free" | "x402" = "free") {
  return {
    requestId: "req-paid-1",
    createdAt: "2026-03-28T12:00:00Z",
    consumer: {
      id: "consumer-1"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Will rainfall exceed 10mm?",
      horizon: "24h",
      desiredOutput: "binary-probability" as const
    },
    payment: {
      preferredMethod
    }
  };
}

function createStripeRequest() {
  return {
    ...createRequest("free"),
    payment: {
      preferredMethod: "stripe" as const
    }
  };
}

describe("payments", () => {
  it("authorizes free pricing through FreePaymentProvider", () => {
    const provider = new FreePaymentProvider();

    expect(
      provider.authorize({
        option: {
          method: "free",
          model: "free"
        },
        request: createRequest("free")
      })
    ).toEqual({
      method: "free",
      authorized: true,
      metadata: {
        price: 0
      }
    });
  });

  it("finds pricing options by method", () => {
    const options: PricingOption[] = [
      { method: "free", model: "free" },
      { method: "custom", model: "custom" }
    ];

    expect(findPricingOption(options, "free")).toEqual({ method: "free", model: "free" });
    expect(findPricingOption(options, "x402")).toBeUndefined();
  });

  it("negotiates the preferred payment method when available", () => {
    const negotiated = negotiatePayment(
      [
        { method: "free", model: "free" },
        { method: "x402", model: "per-request", currency: "USDC", amount: 0.01 }
      ],
      [
        new FreePaymentProvider(),
        new X402PaymentProvider({
          authorize: ({ option }) => ({
            method: option.method,
            authorized: true
          })
        })
      ],
      "x402"
    );

    expect(negotiated?.option.method).toBe("x402");
    expect(negotiated?.provider.method).toBe("x402");
  });

  it("falls back to the first compatible payment method when no preference is provided", () => {
    const negotiator = new PaymentNegotiator({
      pricingOptions: [
        { method: "free", model: "free" },
        { method: "x402", model: "per-request", currency: "USDC", amount: 0.01 }
      ],
      paymentProviders: [
        new FreePaymentProvider(),
        new X402PaymentProvider({
          authorize: ({ option }) => ({
            method: option.method,
            authorized: true
          })
        })
      ]
    });

    const negotiated = negotiator.negotiate();
    expect(negotiated?.option.method).toBe("free");
    expect(negotiated?.provider.method).toBe("free");
  });

  it("delegates x402 authorization through the configured provider", async () => {
    const provider = new X402PaymentProvider({
      authorize: async ({ option, request }) => ({
        method: option.method,
        authorized: true,
        metadata: {
          amount: option.amount,
          currency: option.currency,
          authorization: request.payment?.authorization
        }
      })
    });

    await expect(
      provider.authorize({
        option: {
          method: "x402",
          model: "per-request",
          amount: 0.01,
          currency: "USDC"
        },
        request: {
          ...createRequest("x402"),
          payment: {
            preferredMethod: "x402",
            authorization: {
              paymentHeader: "x402-proof"
            }
          }
        }
      })
    ).resolves.toEqual({
      method: "x402",
      authorized: true,
      metadata: {
        amount: 0.01,
        currency: "USDC",
        authorization: {
          paymentHeader: "x402-proof"
        }
      }
    });
  });

  it("delegates stripe authorization through the configured provider", async () => {
    const provider = new StripePaymentProvider({
      authorize: async ({ option, request }) => ({
        method: option.method,
        authorized: true,
        metadata: {
          amount: option.amount,
          currency: option.currency,
          checkoutSessionId: "cs_test_123",
          authorization: request.payment?.authorization
        }
      })
    });

    await expect(
      provider.authorize({
        option: {
          method: "stripe",
          model: "per-request",
          amount: 1.99,
          currency: "USD"
        },
        request: {
          ...createStripeRequest(),
          payment: {
            preferredMethod: "stripe",
            authorization: {
              checkoutSessionId: "cs_test_123"
            }
          }
        }
      })
    ).resolves.toEqual({
      method: "stripe",
      authorized: true,
      metadata: {
        amount: 1.99,
        currency: "USD",
        checkoutSessionId: "cs_test_123",
        authorization: {
          checkoutSessionId: "cs_test_123"
        }
      }
    });
  });

  it("lets PredictionAgent handle requests when free payment is configured", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [{ method: "free", model: "free" }]
      },
      paymentProviders: [new FreePaymentProvider()],
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.5
        }
      })
    });

    const response = await agent.handleRequest(createRequest("free"));
    expect(response.status).toBe("completed");
  });

  it("returns a failed response when no matching payment provider exists", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [{ method: "free", model: "free" }]
      },
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.5
        }
      })
    });

    const response = await agent.handleRequest(createRequest("free"));
    expect(response.status).toBe("failed");
    if (response.status !== "failed") {
      throw new Error("Expected failed response");
    }
    expect(response.error.message).toContain("No payment provider configured");
  });

  it("lets PredictionAgent use negotiated x402 authorization when configured", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [
          { method: "free", model: "free" },
          { method: "x402", model: "per-request", amount: 0.01, currency: "USDC" }
        ]
      },
      paymentProviders: [
        new X402PaymentProvider({
          authorize: async ({ request }) => ({
            method: "x402",
            authorized: request.payment?.authorization?.["paymentHeader"] === "x402-proof"
          })
        })
      ],
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.5
        }
      })
    });

    const response = await agent.handleRequest({
      ...createRequest("x402"),
      payment: {
        preferredMethod: "x402",
        authorization: {
          paymentHeader: "x402-proof"
        }
      }
    });
    expect(response.status).toBe("completed");
  });

  it("lets PredictionAgent use negotiated stripe authorization when configured", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [
          { method: "stripe", model: "per-request", amount: 1.99, currency: "USD" }
        ]
      },
      paymentProviders: [
        new StripePaymentProvider({
          authorize: async ({ request }) => ({
            method: "stripe",
            authorized: request.payment?.authorization?.["checkoutSessionId"] === "cs_test_123",
            metadata: {
              checkoutSessionId: "cs_test_123"
            }
          })
        })
      ],
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.5
        }
      })
    });

    const response = await agent.handleRequest({
      ...createStripeRequest(),
      payment: {
        preferredMethod: "stripe",
        authorization: {
          checkoutSessionId: "cs_test_123"
        }
      }
    });
    expect(response.status).toBe("completed");
  });

  it("returns a failed response when payment proof is missing for a paid method", async () => {
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      pricing: {
        options: [{ method: "x402", model: "per-request", amount: 0.01, currency: "USDC" }]
      },
      paymentProviders: [
        new X402PaymentProvider({
          authorize: async ({ request }) => ({
            method: "x402",
            authorized: request.payment?.authorization?.["paymentHeader"] === "x402-proof"
          })
        })
      ],
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.5
        }
      })
    });

    const response = await agent.handleRequest(createRequest("x402"));
    expect(response.status).toBe("failed");
    if (response.status !== "failed") {
      throw new Error("Expected failed response");
    }
    expect(response.error.message).toContain("Payment authorization failed");
  });
});
