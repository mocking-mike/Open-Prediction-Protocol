import {
  wrapFetchWithPayment,
  wrapFetchWithPaymentFromConfig,
  type x402Client,
  type x402ClientConfig,
  type x402HTTPClient
} from "@x402/fetch";

import type { PredictionRequest, PredictionResponse } from "../types/index.js";
import type { PredictionTransport } from "./index.js";

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
}

export class X402HttpPredictionTransport implements PredictionTransport {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly fetchWithPayment: typeof fetch;

  constructor(options: X402HttpPredictionTransportOptions) {
    if (!options.client && !options.config) {
      throw new Error("X402HttpPredictionTransport requires either a client or config");
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = options.endpoint ?? "/rpc";

    const baseFetch = options.fetchImpl ?? fetch;
    this.fetchWithPayment = options.client
      ? wrapFetchWithPayment(baseFetch, options.client)
      : wrapFetchWithPaymentFromConfig(baseFetch, options.config!);
  }

  async send(request: PredictionRequest): Promise<PredictionResponse> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "predictions.request",
      params: request
    };

    const response = await this.fetchWithPayment(`${this.baseUrl}${this.endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(rpcRequest)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message =
        response.status === 402
          ? "x402 payment required or authorization failed"
          : `Prediction request failed with status ${response.status}`;
      throw new PredictionPaymentError(message, response.status, body);
    }

    const payload = (await response.json()) as JsonRpcResponse;
    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    return payload.result;
  }
}
