import {
  wrapFetchWithPayment,
  wrapFetchWithPaymentFromConfig,
  type x402Client,
  type x402ClientConfig,
  type x402HTTPClient
} from "@x402/fetch";

import type { PredictionRequest, PredictionResponse } from "../types/index.js";
import {
  TransportOperationController,
  awaitWithSignal,
  readBodyText
} from "./transport-utils.js";
import type { PredictionTransport, PredictionTransportRequestOptions } from "./index.js";

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

export class PredictionPaymentError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = "") {
    super(message);
    this.name = "PredictionPaymentError";
    this.status = status;
    this.body = body;
  }
}

export interface X402HttpPredictionTransportOptions {
  baseUrl: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  client?: x402Client | x402HTTPClient;
  config?: x402ClientConfig;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
}

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class X402HttpPredictionTransport implements PredictionTransport {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly fetchWithPayment: typeof fetch;
  private readonly maxResponseBytes: number;
  private readonly requestTimeoutMs: number;

  constructor(options: X402HttpPredictionTransportOptions) {
    if (!options.client && !options.config) {
      throw new Error("X402HttpPredictionTransport requires either a client or config");
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = options.endpoint ?? "/rpc";
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    const baseFetch = options.fetchImpl ?? fetch;
    this.fetchWithPayment = options.client
      ? wrapFetchWithPayment(baseFetch, options.client)
      : wrapFetchWithPaymentFromConfig(baseFetch, options.config!);
  }

  async send(
    request: PredictionRequest,
    transportOptions: PredictionTransportRequestOptions = {}
  ): Promise<PredictionResponse> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "predictions.request",
      params: request
    };

    const controller = new TransportOperationController(transportOptions.signal);
    controller.configureTimeout(
      this.requestTimeoutMs,
      `Prediction transport request timed out after ${this.requestTimeoutMs}ms`
    );

    try {
      const response = await awaitWithSignal(
        this.fetchWithPayment(`${this.baseUrl}${this.endpoint}`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(rpcRequest),
          signal: controller.signal
        }),
        controller.signal
      );

      if (!response.ok) {
        const body = await readBodyText(response, {
          controller,
          maxBytes: this.maxResponseBytes,
          sizeExceededMessage: `Prediction transport response body exceeded maximum size of ${this.maxResponseBytes} bytes`
        });
        const message =
          response.status === 402
            ? "x402 payment required or authorization failed"
            : `Prediction request failed with status ${response.status}`;
        throw new PredictionPaymentError(message, response.status, body);
      }

      const payloadText = await readBodyText(response, {
        controller,
        maxBytes: this.maxResponseBytes,
        sizeExceededMessage: `Prediction transport response body exceeded maximum size of ${this.maxResponseBytes} bytes`
      });
      const payload = JSON.parse(payloadText) as JsonRpcResponse;
      assertMatchingJsonRpcResponseId(payload.id, request.requestId);
      if ("error" in payload) {
        throw new Error(payload.error.message);
      }

      return payload.result;
    } finally {
      controller.dispose();
    }
  }
}

function assertMatchingJsonRpcResponseId(id: string | number | null, requestId: string): void {
  if (id !== requestId) {
    throw new Error(`JSON-RPC response id does not match request: ${String(id)}`);
  }
}
