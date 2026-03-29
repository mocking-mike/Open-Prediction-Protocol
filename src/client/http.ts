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

export interface HttpPredictionTransportOptions {
  baseUrl: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class HttpPredictionTransport implements PredictionTransport {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpPredictionTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = options.endpoint ?? "/rpc";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(request: PredictionRequest): Promise<PredictionResponse> {
    const rpcRequest = {
      jsonrpc: "2.0" as const,
      id: request.requestId,
      method: "predictions.request",
      params: request
    };

    const response = await this.fetchImpl(`${this.baseUrl}${this.endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(rpcRequest)
    });

    const payload = (await response.json()) as JsonRpcResponse;

    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    return payload.result;
  }
}
