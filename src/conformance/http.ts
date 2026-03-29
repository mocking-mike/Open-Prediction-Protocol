import type {
  AgentCard,
  AgentIdentity,
  PredictionCapability,
  PredictionRequest,
  PredictionResponse
} from "../types/index.js";
import {
  validateAgentCard,
  validatePredictionResponse
} from "../schemas/index.js";
import {
  canTransitionPredictionLifecycle,
  predictionLifecycleStates,
  type PredictionLifecycleState
} from "../lifecycle/index.js";

export interface HttpProviderConformanceOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  requestFactory?: (capability: PredictionCapability, agentCard: AgentCard) => PredictionRequest;
}

export interface ConformanceCheck {
  id: string;
  ok: boolean;
  severity: "error" | "warning";
  message: string;
}

export interface HttpProviderConformanceReport {
  baseUrl: string;
  request: PredictionRequest;
  checks: ConformanceCheck[];
  agentCard?: AgentCard;
  response?: PredictionResponse;
}

export async function runHttpProviderConformance(
  options: HttpProviderConformanceOptions
): Promise<HttpProviderConformanceReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const checks: ConformanceCheck[] = [];

  const agentCardResponse = await fetchImpl(
    `${baseUrl}/.well-known/agent.json`,
    options.headers ? { headers: options.headers } : undefined
  );
  pushCheck(checks, "discovery.status", agentCardResponse.status === 200, "error", [
    "GET /.well-known/agent.json must return HTTP 200"
  ]);

  const agentCardJson = await agentCardResponse.json();
  pushCheck(checks, "discovery.schema", validateAgentCard(agentCardJson), "error", [
    "Agent Card must validate against agent-card.schema.json"
  ]);

  const agentCard = agentCardJson as AgentCard;
  const capability = selectConformanceCapability(agentCard);
  pushCheck(checks, "discovery.capability", Boolean(capability), "error", [
    "Agent Card must advertise at least one prediction capability for conformance checks"
  ]);

  const healthResponse = await fetchImpl(
    `${baseUrl}/health`,
    options.headers ? { headers: options.headers } : undefined
  );
  pushCheck(checks, "health.status", healthResponse.status === 200, "warning", [
    "GET /health should return HTTP 200 when the provider is operational"
  ]);
  const healthPayload = await safeJson(healthResponse);
  pushCheck(checks, "health.json", isJsonObject(healthPayload), "warning", [
    "GET /health should return a machine-readable JSON object"
  ]);

  if (!capability) {
    return {
      baseUrl,
      request: createFallbackRequest(),
      checks,
      agentCard
    };
  }

  const request = options.requestFactory?.(capability, agentCard) ?? createConformanceRequest(capability);
  const rpcResponse = await fetchImpl(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: request.requestId,
      method: "predictions.request",
      params: request
    })
  });
  pushCheck(checks, "rpc.status", rpcResponse.status === 200, "error", [
    "POST /rpc should return HTTP 200 for a valid JSON-RPC request"
  ]);

  const rpcPayload = (await rpcResponse.json()) as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: { message?: unknown };
  };
  pushCheck(checks, "rpc.jsonrpc", rpcPayload.jsonrpc === "2.0", "error", [
    "JSON-RPC response must declare jsonrpc = 2.0"
  ]);
  pushCheck(checks, "rpc.idBinding", rpcPayload.id === request.requestId, "error", [
    "JSON-RPC response id must match the originating request id"
  ]);
  pushCheck(checks, "rpc.result", Boolean(rpcPayload.result) && !rpcPayload.error, "error", [
    "predictions.request must return a JSON-RPC result for a valid request"
  ]);
  const predictionResponse = parsePredictionResponse(rpcPayload.result);
  pushCheck(
    checks,
    "rpc.responseSchema",
    Boolean(predictionResponse),
    "error",
    ["Prediction result must validate against prediction-response.schema.json"]
  );
  if (predictionResponse) {
    pushCheck(checks, "rpc.requestBinding", predictionResponse.requestId === request.requestId, "error", [
      "Prediction response must preserve requestId"
    ]);
    pushCheck(
      checks,
      "rpc.forecastDomainBinding",
      predictionResponse.status !== "completed" || predictionResponse.forecast.domain === request.prediction.domain,
      "error",
      ["Completed prediction responses must preserve the requested domain"]
    );
    pushCheck(
      checks,
      "rpc.forecastHorizonBinding",
      predictionResponse.status !== "completed" || predictionResponse.forecast.horizon === request.prediction.horizon,
      "error",
      ["Completed prediction responses must preserve the requested horizon"]
    );
    pushCheck(
      checks,
      "rpc.forecastTypeBinding",
      predictionResponse.status !== "completed" ||
        predictionResponse.forecast.type === request.prediction.desiredOutput,
      "error",
      ["Completed prediction responses must preserve the requested output type"]
    );
    pushCheck(
      checks,
      "rpc.providerBinding",
      matchesAgentCardIdentity(agentCard, predictionResponse.provider),
      "error",
      ["Prediction response provider identity must match Agent Card identity metadata when advertised"]
    );
  } else {
    pushCheck(checks, "rpc.requestBinding", false, "error", [
      "Prediction response must preserve requestId"
    ]);
    pushCheck(checks, "rpc.forecastDomainBinding", false, "error", [
      "Completed prediction responses must preserve the requested domain"
    ]);
    pushCheck(checks, "rpc.forecastHorizonBinding", false, "error", [
      "Completed prediction responses must preserve the requested horizon"
    ]);
    pushCheck(checks, "rpc.forecastTypeBinding", false, "error", [
      "Completed prediction responses must preserve the requested output type"
    ]);
    pushCheck(checks, "rpc.providerBinding", false, "error", [
      "Prediction response provider identity must match Agent Card identity metadata when advertised"
    ]);
  }

  const streamResponse = await fetchImpl(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: request.requestId,
      method: "tasks/sendSubscribe",
      params: request
    })
  });

  const contentType = streamResponse.headers.get("content-type") ?? "";
  pushCheck(
    checks,
    "stream.contentType",
    contentType.includes("text/event-stream"),
    "error",
    ["tasks/sendSubscribe must return Content-Type: text/event-stream"]
  );

  const streamEvents = await readStreamEvents(streamResponse);
  pushCheck(checks, "stream.hasEvents", streamEvents.length > 0, "error", [
    "tasks/sendSubscribe must emit lifecycle and result events"
  ]);

  const lifecycleStates = streamEvents
    .filter((event): event is { type: "lifecycle"; state: string } => event.type === "lifecycle")
    .map((event) => event.state);
  const lifecycleRequestIds = streamEvents
    .filter((event): event is StreamLifecycleEvent => event.type === "lifecycle")
    .map((event) => event.requestId);
  const lifecycleProviders = streamEvents.flatMap((event) =>
    event.type === "lifecycle" && event.provider ? [event.provider] : []
  );
  const streamResults = streamEvents.filter(
    (event): event is { type: "result"; response: unknown } => event.type === "result"
  );
  const streamResult = streamResults[0];
  const streamPredictionResponse = parsePredictionResponse(streamResult?.response);

  pushCheck(checks, "stream.submitted", lifecycleStates.includes("submitted"), "error", [
    "Streaming lifecycle must include submitted"
  ]);
  pushCheck(checks, "stream.working", lifecycleStates.includes("working"), "error", [
    "Streaming lifecycle must include working"
  ]);
  pushCheck(checks, "stream.result", Boolean(streamResult), "error", [
    "Streaming lifecycle must include one terminal result event"
  ]);
  pushCheck(checks, "stream.resultCardinality", streamResults.length === 1, "error", [
    "Streaming lifecycle must include exactly one terminal result event"
  ]);
  pushCheck(
    checks,
    "stream.terminalResultLast",
    streamEvents.length > 0 && streamEvents[streamEvents.length - 1]?.type === "result",
    "error",
    ["Streaming lifecycle must end with the terminal result event"]
  );
  pushCheck(
    checks,
    "stream.resultSchema",
    Boolean(streamPredictionResponse),
    "error",
    ["Streaming result payload must validate against prediction-response.schema.json"]
  );
  pushCheck(
    checks,
    "stream.lifecycleRequestBinding",
    lifecycleRequestIds.length > 0 && lifecycleRequestIds.every((requestId) => requestId === request.requestId),
    "error",
    ["Streaming lifecycle events must preserve requestId"]
  );
  pushCheck(
    checks,
    "stream.resultRequestBinding",
    matchesResponseRequestId(streamPredictionResponse, request),
    "error",
    ["Streaming terminal responses must preserve requestId"]
  );
  pushCheck(
    checks,
    "stream.forecastDomainBinding",
    matchesForecastDomain(streamPredictionResponse, request),
    "error",
    ["Streaming terminal responses must preserve the requested domain"]
  );
  pushCheck(
    checks,
    "stream.forecastHorizonBinding",
    matchesForecastHorizon(streamPredictionResponse, request),
    "error",
    ["Streaming terminal responses must preserve the requested horizon"]
  );
  pushCheck(
    checks,
    "stream.forecastTypeBinding",
    matchesForecastType(streamPredictionResponse, request),
    "error",
    ["Streaming terminal responses must preserve the requested output type"]
  );
  pushCheck(
    checks,
    "stream.providerBinding",
    lifecycleProviders.every((provider) => matchesAgentCardIdentity(agentCard, provider)) &&
      matchesResponseProvider(agentCard, streamPredictionResponse),
    "error",
    ["Streaming provider identities must match Agent Card identity metadata when advertised"]
  );
  pushCheck(
    checks,
    "stream.lifecycleOrder",
    isValidLifecycleSequence(lifecycleStates),
    "error",
    ["Streaming lifecycle states must follow the documented lifecycle transitions"]
  );

  const invalidRpcResponse = await fetchImpl(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "opp-conformance-invalid-request",
      method: "predictions.request",
      params: {}
    })
  });
  pushCheck(checks, "errors.invalidRequest.status", invalidRpcResponse.status === 400, "warning", [
    "Invalid predictions.request payloads should return HTTP 400"
  ]);
  const invalidRpcPayload = (await safeJson(invalidRpcResponse)) as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: { message?: unknown };
  };
  pushCheck(checks, "errors.invalidRequest.jsonrpc", invalidRpcPayload?.jsonrpc === "2.0", "warning", [
    "Invalid predictions.request payloads should return a JSON-RPC error envelope"
  ]);
  pushCheck(
    checks,
    "errors.invalidRequest.structured",
    !invalidRpcPayload?.result &&
      Boolean(invalidRpcPayload?.error) &&
      invalidRpcPayload?.id === "opp-conformance-invalid-request",
    "warning",
    ["Invalid predictions.request payloads should return a structured JSON-RPC error"]
  );
  pushCheck(
    checks,
    "errors.invalidRequest.sanitized",
    invalidRpcPayload?.error?.message === "Request validation failed",
    "warning",
    ["Invalid predictions.request payloads should sanitize public validation errors by default"]
  );

  const invalidStreamResponse = await fetchImpl(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "opp-conformance-invalid-stream-request",
      method: "tasks/sendSubscribe",
      params: {}
    })
  });
  pushCheck(checks, "errors.invalidStreamRequest.status", invalidStreamResponse.status === 400, "warning", [
    "Invalid tasks/sendSubscribe payloads should return HTTP 400"
  ]);
  pushCheck(
    checks,
    "errors.invalidStreamRequest.contentType",
    (invalidStreamResponse.headers.get("content-type") ?? "").includes("application/json"),
    "warning",
    ["Invalid tasks/sendSubscribe payloads should return JSON-RPC errors before opening an event stream"]
  );
  const invalidStreamPayload = (await safeJson(invalidStreamResponse)) as {
    jsonrpc?: unknown;
    id?: unknown;
    result?: unknown;
    error?: { message?: unknown };
  };
  pushCheck(
    checks,
    "errors.invalidStreamRequest.jsonrpc",
    invalidStreamPayload?.jsonrpc === "2.0",
    "warning",
    ["Invalid tasks/sendSubscribe payloads should return a JSON-RPC error envelope"]
  );
  pushCheck(
    checks,
    "errors.invalidStreamRequest.structured",
    !invalidStreamPayload?.result &&
      Boolean(invalidStreamPayload?.error) &&
      invalidStreamPayload?.id === "opp-conformance-invalid-stream-request",
    "warning",
    ["Invalid tasks/sendSubscribe payloads should return a structured JSON-RPC error"]
  );
  pushCheck(
    checks,
    "errors.invalidStreamRequest.sanitized",
    invalidStreamPayload?.error?.message === "Request validation failed",
    "warning",
    ["Invalid tasks/sendSubscribe payloads should sanitize public validation errors by default"]
  );

  const report: HttpProviderConformanceReport = {
    baseUrl,
    request,
    checks,
    agentCard
  };
  if (predictionResponse) {
    report.response = predictionResponse;
  }
  return report;
}

function selectConformanceCapability(agentCard: AgentCard): PredictionCapability | undefined {
  return agentCard.capabilities.predictions.find((capability) => capability.output.type === "binary-probability");
}

function createConformanceRequest(capability: PredictionCapability): PredictionRequest {
  return {
    requestId: "opp-conformance-request",
    createdAt: "2026-03-29T00:00:00Z",
    consumer: {
      id: "opp-conformance-runner"
    },
    prediction: {
      domain: capability.domain,
      question: `Conformance check for ${capability.domain}`,
      horizon: capability.horizons[0] ?? "24h",
      desiredOutput: capability.output.type
    }
  };
}

function createFallbackRequest(): PredictionRequest {
  return {
    requestId: "opp-conformance-request",
    createdAt: "2026-03-29T00:00:00Z",
    consumer: {
      id: "opp-conformance-runner"
    },
    prediction: {
      domain: "weather.precipitation",
      question: "Conformance check",
      horizon: "24h",
      desiredOutput: "binary-probability"
    }
  };
}

function pushCheck(
  checks: ConformanceCheck[],
  id: string,
  ok: boolean,
  severity: "error" | "warning",
  messages: [string]
): void {
  checks.push({
    id,
    ok,
    severity,
    message: messages[0]
  });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

async function readStreamEvents(response: Response): Promise<StreamConformanceEvent[]> {
  if (!response.body) {
    return [];
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StreamConformanceEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
    const frames = normalizedBuffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (parsed) {
        events.push(parsed);
      }
    }
  }

  buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
  const trailingFrame = parseSseFrame(buffer);
  if (trailingFrame) {
    events.push(trailingFrame);
  }

  return events;
}

function parsePredictionResponse(value: unknown): PredictionResponse | undefined {
  return validatePredictionResponse(value) ? (value as PredictionResponse) : undefined;
}

function matchesAgentCardIdentity(agentCard: AgentCard, provider: AgentIdentity): boolean {
  if (agentCard.identity?.id && provider.id !== agentCard.identity.id) {
    return false;
  }

  if (agentCard.identity?.did && provider.did !== agentCard.identity.did) {
    return false;
  }

  return true;
}

function matchesResponseProvider(agentCard: AgentCard, response: PredictionResponse | undefined): boolean {
  if (!response) {
    return false;
  }

  return matchesAgentCardIdentity(agentCard, response.provider);
}

function matchesResponseRequestId(
  response: PredictionResponse | undefined,
  request: PredictionRequest
): boolean {
  if (!response) {
    return false;
  }

  return response.requestId === request.requestId;
}

function matchesForecastDomain(
  response: PredictionResponse | undefined,
  request: PredictionRequest
): boolean {
  if (!response) {
    return false;
  }

  if (response.status !== "completed") {
    return true;
  }

  return response.forecast.domain === request.prediction.domain;
}

function matchesForecastHorizon(
  response: PredictionResponse | undefined,
  request: PredictionRequest
): boolean {
  if (!response) {
    return false;
  }

  if (response.status !== "completed") {
    return true;
  }

  return response.forecast.horizon === request.prediction.horizon;
}

function matchesForecastType(
  response: PredictionResponse | undefined,
  request: PredictionRequest
): boolean {
  if (!response) {
    return false;
  }

  if (response.status !== "completed") {
    return true;
  }

  return response.forecast.type === request.prediction.desiredOutput;
}

interface StreamLifecycleEvent {
  type: "lifecycle";
  requestId: string;
  createdAt: string;
  state: string;
  provider?: AgentIdentity;
}

interface StreamConformanceEvent {
  type: string;
  requestId?: string;
  createdAt?: string;
  state?: string;
  provider?: AgentIdentity;
  response?: unknown;
}

function parseSseFrame(frame: string): StreamConformanceEvent | undefined {
  const trimmed = frame.trim();
  if (!trimmed) {
    return undefined;
  }

  const dataLines: string[] = [];
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return undefined;
  }

  return JSON.parse(dataLines.join("\n")) as StreamConformanceEvent;
}

function isValidLifecycleSequence(states: string[]): boolean {
  if (states.length === 0) {
    return false;
  }

  if (!states.every(isPredictionLifecycleState)) {
    return false;
  }

  const first = states[0];
  if (!first) {
    return false;
  }

  let previous = first;
  for (let index = 1; index < states.length; index += 1) {
    const next = states[index];
    if (!next) {
      return false;
    }
    if (!canTransitionPredictionLifecycle(previous, next)) {
      return false;
    }
    previous = next;
  }

  return true;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPredictionLifecycleState(value: string): value is PredictionLifecycleState {
  return predictionLifecycleStates.includes(value as PredictionLifecycleState);
}
