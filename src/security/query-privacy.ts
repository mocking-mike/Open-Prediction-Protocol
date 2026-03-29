import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { PredictionRequest } from "../types/index.js";

const REDACTED_PLACEHOLDER = "[REDACTED]";
const COMMITMENT_SCHEME = "opp-hmac-sha256-v1" as const;
const COMMITMENT_DOMAIN_SEPARATOR = "opp-query-privacy-v1";

export interface PredictionPrivacyReveal {
  scheme: typeof COMMITMENT_SCHEME;
  secret: string;
}

export interface CreateCommittedPredictionRequestOptions {
  preserveContextKeys?: string[];
  reveal?: PredictionPrivacyReveal;
}

export interface CreateCommittedPredictionRequestResult {
  request: PredictionRequest;
  reveal: PredictionPrivacyReveal;
}

export interface VerifyCommittedPredictionRevealOptions {
  committedRequest: PredictionRequest;
  originalRequest: PredictionRequest;
  reveal: PredictionPrivacyReveal;
}

export function createCommittedPredictionRequest(
  request: PredictionRequest,
  options: CreateCommittedPredictionRequestOptions = {}
): CreateCommittedPredictionRequestResult {
  const reveal = options.reveal ?? createPredictionPrivacyReveal();
  const preservedContext = selectPreservedContext(
    request.prediction.context,
    options.preserveContextKeys ?? []
  );
  const redactedKeys = listRedactedContextKeys(
    request.prediction.context,
    options.preserveContextKeys ?? []
  );
  const hasPreservedContext = Object.keys(preservedContext).length > 0;

  const committedRequest: PredictionRequest = {
    ...request,
    prediction: {
      ...request.prediction,
      question: REDACTED_PLACEHOLDER,
      ...(request.prediction.resolution ? { resolution: REDACTED_PLACEHOLDER } : {}),
      ...(request.prediction.context && hasPreservedContext
        ? {
            context: preservedContext
          }
        : {})
    },
    privacy: {
      ...(request.privacy ?? {}),
      mode: "committed",
      commitment: {
        scheme: COMMITMENT_SCHEME,
        question: commitValue(reveal.secret, "question", request.prediction.question),
        context: commitValue(reveal.secret, "context", request.prediction.context ?? {}),
        ...(request.prediction.resolution
          ? {
              resolution: commitValue(
                reveal.secret,
                "resolution",
                request.prediction.resolution
              )
            }
          : {}),
        ...(redactedKeys.length > 0 ? { redactedKeys } : {})
      }
    }
  };

  return {
    request: committedRequest,
    reveal
  };
}

export function createPredictionPrivacyReveal(): PredictionPrivacyReveal {
  return {
    scheme: COMMITMENT_SCHEME,
    secret: randomBytes(32).toString("base64url")
  };
}

export function isCommittedPredictionRequest(request: PredictionRequest): boolean {
  return request.privacy?.mode === "committed";
}

export function verifyCommittedPredictionReveal(
  options: VerifyCommittedPredictionRevealOptions
): boolean {
  if (!isCommittedPredictionRequest(options.committedRequest)) {
    return false;
  }

  const commitment = options.committedRequest.privacy?.commitment;
  if (!commitment || commitment.scheme !== COMMITMENT_SCHEME) {
    return false;
  }

  if (!matchesCommittedEnvelope(options.committedRequest, options.originalRequest, commitment)) {
    return false;
  }

  if (options.reveal.scheme !== COMMITMENT_SCHEME || options.reveal.secret.length === 0) {
    return false;
  }

  if (
    !safeEqualHex(
      commitValue(options.reveal.secret, "question", options.originalRequest.prediction.question),
      commitment.question
    )
  ) {
    return false;
  }

  if (
    !safeEqualHex(
      commitValue(options.reveal.secret, "context", options.originalRequest.prediction.context ?? {}),
      commitment.context
    )
  ) {
    return false;
  }

  if (commitment.resolution !== undefined) {
    if (!options.originalRequest.prediction.resolution) {
      return false;
    }

    if (
      !safeEqualHex(
        commitValue(
          options.reveal.secret,
          "resolution",
          options.originalRequest.prediction.resolution
        ),
        commitment.resolution
      )
    ) {
      return false;
    }
  }

  return true;
}

function matchesCommittedEnvelope(
  committedRequest: PredictionRequest,
  originalRequest: PredictionRequest,
  commitment: NonNullable<NonNullable<PredictionRequest["privacy"]>["commitment"]>
): boolean {
  if (
    committedRequest.requestId !== originalRequest.requestId ||
    committedRequest.createdAt !== originalRequest.createdAt ||
    committedRequest.prediction.domain !== originalRequest.prediction.domain ||
    committedRequest.prediction.horizon !== originalRequest.prediction.horizon ||
    committedRequest.prediction.desiredOutput !== originalRequest.prediction.desiredOutput
  ) {
    return false;
  }

  if (
    canonicalizeJson(committedRequest.consumer) !== canonicalizeJson(originalRequest.consumer) ||
    canonicalizeJson(committedRequest.constraints ?? null) !==
      canonicalizeJson(originalRequest.constraints ?? null) ||
    canonicalizeJson(committedRequest.payment ?? null) !== canonicalizeJson(originalRequest.payment ?? null)
  ) {
    return false;
  }

  if (committedRequest.prediction.question !== REDACTED_PLACEHOLDER) {
    return false;
  }

  if (originalRequest.prediction.resolution) {
    if (committedRequest.prediction.resolution !== REDACTED_PLACEHOLDER) {
      return false;
    }
  } else if (committedRequest.prediction.resolution !== undefined) {
    return false;
  }

  const committedContext = committedRequest.prediction.context ?? {};
  const originalContext = originalRequest.prediction.context ?? {};
  const preservedKeys = Object.keys(committedContext).sort(compareUtf16CodeUnits);
  const expectedPreservedContext = selectPreservedContext(originalContext, preservedKeys);
  if (canonicalizeJson(committedContext) !== canonicalizeJson(expectedPreservedContext)) {
    return false;
  }

  const expectedRedactedKeys = listRedactedContextKeys(originalRequest.prediction.context, preservedKeys);
  const actualRedactedKeys = [...(commitment.redactedKeys ?? [])].sort(compareUtf16CodeUnits);
  if (canonicalizeJson(actualRedactedKeys) !== canonicalizeJson(expectedRedactedKeys)) {
    return false;
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

function commitValue(secret: string, label: string, value: unknown): string {
  return createHmac("sha256", secret)
    .update(COMMITMENT_DOMAIN_SEPARATOR)
    .update("\0")
    .update(label)
    .update("\0")
    .update(canonicalizeJson(value))
    .digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length || left.length % 2 !== 0 || !isHex(left) || !isHex(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function isHex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value);
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
