import { createHash } from "node:crypto";

import type { PredictionRequest } from "../types/index.js";

const BLINDED_PLACEHOLDER = "[BLINDED]";

export interface CreateBlindedPredictionRequestOptions {
  preserveContextKeys?: string[];
}

export interface VerifyBlindedPredictionRevealOptions {
  blindedRequest: PredictionRequest;
  originalRequest: PredictionRequest;
}

export function createBlindedPredictionRequest(
  request: PredictionRequest,
  options: CreateBlindedPredictionRequestOptions = {}
): PredictionRequest {
  const preservedContext = selectPreservedContext(
    request.prediction.context,
    options.preserveContextKeys ?? []
  );
  const redactedKeys = listRedactedContextKeys(
    request.prediction.context,
    options.preserveContextKeys ?? []
  );

  const blindedContext: Record<string, unknown> = {
    ...preservedContext,
    _blinded: true,
    _questionHash: hashValue(request.prediction.question),
    _contextHash: hashValue(request.prediction.context ?? {})
  };

  if (request.prediction.resolution) {
    blindedContext._resolutionHash = hashValue(request.prediction.resolution);
  }

  if (redactedKeys.length > 0) {
    blindedContext._redactedKeys = redactedKeys;
  }

  return {
    ...request,
    prediction: {
      ...request.prediction,
      question: BLINDED_PLACEHOLDER,
      ...(request.prediction.resolution ? { resolution: BLINDED_PLACEHOLDER } : {}),
      context: blindedContext
    },
    privacy: {
      ...(request.privacy ?? {}),
      mode: "blinded"
    }
  };
}

export function isBlindedPredictionRequest(request: PredictionRequest): boolean {
  return request.privacy?.mode === "blinded";
}

export function verifyBlindedPredictionReveal(
  options: VerifyBlindedPredictionRevealOptions
): boolean {
  if (!isBlindedPredictionRequest(options.blindedRequest)) {
    return false;
  }

  const context = options.blindedRequest.prediction.context;
  if (!context || typeof context !== "object") {
    return false;
  }

  const blindedContext = context as Record<string, unknown>;
  const questionHash = blindedContext._questionHash;
  const contextHash = blindedContext._contextHash;
  const resolutionHash = blindedContext._resolutionHash;

  if (typeof questionHash !== "string" || typeof contextHash !== "string") {
    return false;
  }

  if (hashValue(options.originalRequest.prediction.question) !== questionHash) {
    return false;
  }

  if (hashValue(options.originalRequest.prediction.context ?? {}) !== contextHash) {
    return false;
  }

  if (resolutionHash !== undefined) {
    if (typeof resolutionHash !== "string") {
      return false;
    }

    if (!options.originalRequest.prediction.resolution) {
      return false;
    }

    if (hashValue(options.originalRequest.prediction.resolution) !== resolutionHash) {
      return false;
    }
  }

  return true;
}

function selectPreservedContext(
  context: Record<string, unknown> | undefined,
  preserveContextKeys: string[]
): Record<string, unknown> {
  if (!context || preserveContextKeys.length === 0) {
    return {};
  }

  const preserved: Record<string, unknown> = {};
  for (const key of preserveContextKeys) {
    if (key in context) {
      preserved[key] = context[key];
    }
  }

  return preserved;
}

function listRedactedContextKeys(
  context: Record<string, unknown> | undefined,
  preserveContextKeys: string[]
): string[] {
  if (!context) {
    return [];
  }

  const preservedSet = new Set(preserveContextKeys);
  return Object.keys(context)
    .filter((key) => !preservedSet.has(key))
    .sort(compareUtf16CodeUnits);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(canonicalizeJson(value)).digest("hex");
}

function canonicalizeJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Query privacy canonical JSON does not support non-finite numbers");
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeJson(entryValue)}`);

  return `{${entries.join(",")}}`;
}

function compareUtf16CodeUnits(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) {
      return difference;
    }
  }

  return left.length - right.length;
}
