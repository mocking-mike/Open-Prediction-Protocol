import { beforeEach, describe, expect, it, vi } from "vitest";

const x402Mocks = vi.hoisted(() => ({
  wrapFetchWithPaymentMock: vi.fn(),
  wrapFetchWithPaymentFromConfigMock: vi.fn(),
  paymentMiddlewareMock: vi.fn(),
  paymentMiddlewareFromConfigMock: vi.fn(),
  paymentMiddlewareFromHTTPServerMock: vi.fn()
}));

vi.mock("@x402/fetch", () => ({
  wrapFetchWithPayment: x402Mocks.wrapFetchWithPaymentMock,
  wrapFetchWithPaymentFromConfig: x402Mocks.wrapFetchWithPaymentFromConfigMock
}));

vi.mock("@x402/express", () => ({
  paymentMiddleware: x402Mocks.paymentMiddlewareMock,
  paymentMiddlewareFromConfig: x402Mocks.paymentMiddlewareFromConfigMock,
  paymentMiddlewareFromHTTPServer: x402Mocks.paymentMiddlewareFromHTTPServerMock,
  x402HTTPResourceServer: class {},
  x402ResourceServer: class {}
}));

import {
  createX402ExpressMiddleware,
  createX402ExpressMiddlewareFromHttpServer
} from "../src/server/x402-express.js";
import {
  PredictionPaymentError,
  X402HttpPredictionTransport
} from "../src/client/x402.js";

describe("x402 integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires either a client or config for x402 fetch transport", () => {
    expect(
      () =>
        new X402HttpPredictionTransport({
          baseUrl: "https://provider.example.com"
        })
    ).toThrow("requires either a client or config");
  });

  it("creates an x402 transport from config using a wrapped fetch", async () => {
    const wrappedFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: "req-1",
        result: {
          responseId: "resp-1",
          requestId: "req-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id: "provider-1"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.5
          }
        }
      })
    } as Response);
    x402Mocks.wrapFetchWithPaymentFromConfigMock.mockReturnValue(wrappedFetch);
    const fetchImpl = vi.fn<typeof fetch>();
    const config = {
      schemes: []
    };

    const transport = new X402HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl,
      config
    });

    const response = await transport.send({
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
    });

    expect(x402Mocks.wrapFetchWithPaymentFromConfigMock).toHaveBeenCalledWith(fetchImpl, config);
    expect(wrappedFetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe("completed");
  });

  it("rejects x402 JSON-RPC replies whose id does not match the active request", async () => {
    const wrappedFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: "req-other",
        result: {
          responseId: "resp-1",
          requestId: "req-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id: "provider-1"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.5
          }
        }
      })
    } as Response);
    x402Mocks.wrapFetchWithPaymentFromConfigMock.mockReturnValue(wrappedFetch);

    const transport = new X402HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: vi.fn<typeof fetch>(),
      config: {
        schemes: []
      }
    });

    await expect(
      transport.send({
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
      })
    ).rejects.toThrow("JSON-RPC response id does not match request");
  });

  it("rejects oversized x402 JSON-RPC response bodies", async () => {
    const wrappedFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({
                jsonrpc: "2.0",
                id: "req-1",
                result: {
                  responseId: "resp-1",
                  requestId: "req-1",
                  status: "completed",
                  createdAt: "2026-03-28T12:01:00Z",
                  provider: {
                    id: "provider-1"
                  },
                  forecast: {
                    type: "binary-probability",
                    domain: "weather.precipitation",
                    horizon: "24h",
                    generatedAt: "2026-03-28T12:01:00Z",
                    probability: 0.5
                  }
                }
              })
            )
          );
          controller.close();
        }
      })
    } as Response);
    x402Mocks.wrapFetchWithPaymentFromConfigMock.mockReturnValue(wrappedFetch);

    const transport = new X402HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      maxResponseBytes: 32,
      fetchImpl: vi.fn<typeof fetch>(),
      config: {
        schemes: []
      }
    });

    await expect(
      transport.send({
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
      })
    ).rejects.toThrow("response body exceeded maximum size");
  });

  it("creates express middleware from a server instance", () => {
    const middlewareStub = vi.fn(async () => undefined);
    x402Mocks.paymentMiddlewareMock.mockReturnValue(middlewareStub);
    const server = {
      syncFacilitator: vi.fn(async () => undefined)
    } as never;

    const middleware = createX402ExpressMiddleware({
      routes: {},
      server
    });

    expect(middleware).toBe(middlewareStub);
    expect(x402Mocks.paymentMiddlewareMock).toHaveBeenCalledWith(
      {},
      server,
      undefined,
      undefined,
      undefined
    );
  });

  it("creates express middleware from an HTTP server instance", () => {
    const middlewareStub = vi.fn(async () => undefined);
    x402Mocks.paymentMiddlewareFromHTTPServerMock.mockReturnValue(middlewareStub);
    const httpServer = {
      initialize: vi.fn(async () => undefined)
    } as never;

    const middleware = createX402ExpressMiddlewareFromHttpServer({
      httpServer
    });

    expect(middleware).toBe(middlewareStub);
    expect(x402Mocks.paymentMiddlewareFromHTTPServerMock).toHaveBeenCalledWith(
      httpServer,
      undefined,
      undefined,
      undefined
    );
  });

  it("throws a payment error when the paid request fails before JSON-RPC parsing", async () => {
    const wrappedFetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "payment required"
    } as Response);
    x402Mocks.wrapFetchWithPaymentFromConfigMock.mockReturnValue(wrappedFetch);

    const transport = new X402HttpPredictionTransport({
      baseUrl: "https://provider.example.com",
      fetchImpl: vi.fn<typeof fetch>(),
      config: {
        schemes: []
      }
    });

    await expect(
      transport.send({
        requestId: "req-402",
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
      })
    ).rejects.toMatchObject({
      name: "PredictionPaymentError",
      status: 402,
      body: "payment required"
    });
  });
});
