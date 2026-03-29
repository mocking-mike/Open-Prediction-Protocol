import { createHash } from "node:crypto";

import type { BinaryResolutionObservation, CalibrationScoreType } from "../observability/metrics.js";
import type {
  PredictionRequest,
  PredictionResponse,
  VerificationStatus
} from "../types/index.js";

export interface PredictionResolutionLedgerRecord {
  requestId: string;
  responseId: string;
  domain: string;
  scoreType: CalibrationScoreType;
  observation: BinaryResolutionObservation;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string[];
}

interface LedgerEntryBase {
  sequence: number;
  recordedAt: string;
  previousHash?: string;
  entryHash: string;
}

export interface PredictionRequestLedgerEntry extends LedgerEntryBase {
  kind: "request";
  request: PredictionRequest;
}

export interface PredictionResponseLedgerEntry extends LedgerEntryBase {
  kind: "response";
  response: PredictionResponse;
}

export interface PredictionResolutionLedgerEntry extends LedgerEntryBase {
  kind: "resolution";
  resolution: PredictionResolutionLedgerRecord;
}

export type PredictionLedgerEntry =
  | PredictionRequestLedgerEntry
  | PredictionResponseLedgerEntry
  | PredictionResolutionLedgerEntry;

export class PredictionLedger {
  private readonly entries: PredictionLedgerEntry[] = [];
  private readonly requestIds = new Set<string>();
  private readonly responseIds = new Set<string>();

  appendRequest(request: PredictionRequest): PredictionRequestLedgerEntry {
    const entry = this.createRequestEntry(clone(request));
    this.entries.push(entry);
    this.requestIds.add(request.requestId);
    return clone(entry);
  }

  appendResponse(response: PredictionResponse): PredictionResponseLedgerEntry {
    if (!this.requestIds.has(response.requestId)) {
      throw new Error(`Cannot append response for unknown request: ${response.requestId}`);
    }

    const entry = this.createResponseEntry(clone(response));
    this.entries.push(entry);
    this.responseIds.add(response.responseId);
    return clone(entry);
  }

  appendResolution(
    resolution: PredictionResolutionLedgerRecord
  ): PredictionResolutionLedgerEntry {
    if (!this.requestIds.has(resolution.requestId)) {
      throw new Error(`Cannot append resolution for unknown request: ${resolution.requestId}`);
    }

    if (!this.responseIds.has(resolution.responseId)) {
      throw new Error(`Cannot append resolution for unknown response: ${resolution.responseId}`);
    }

    const entry = this.createResolutionEntry(clone(resolution));
    this.entries.push(entry);
    return clone(entry);
  }

  getEntries(): PredictionLedgerEntry[] {
    return this.entries.map((entry) => clone(entry));
  }

  verifyIntegrity(): boolean {
    let previousHash: string | undefined;

    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (!entry) {
        return false;
      }

      if (entry.sequence !== index + 1) {
        return false;
      }

      if (entry.previousHash !== previousHash) {
        return false;
      }

      const expectedHash = this.computeEntryHash({
        sequence: entry.sequence,
        recordedAt: entry.recordedAt,
        previousHash: entry.previousHash,
        kind: entry.kind,
        ...(entry.kind === "request"
          ? { request: entry.request }
          : entry.kind === "response"
            ? { response: entry.response }
            : { resolution: entry.resolution })
      });

      if (entry.entryHash !== expectedHash) {
        return false;
      }

      previousHash = entry.entryHash;
    }

    return true;
  }

  private createRequestEntry(request: PredictionRequest): PredictionRequestLedgerEntry {
    const sequence = this.entries.length + 1;
    const previousHash = this.entries[this.entries.length - 1]?.entryHash;
    const recordedAt = new Date().toISOString();
    const hashInput = {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      kind: "request" as const,
      request
    };
    const entryHash = this.computeEntryHash(hashInput);

    return {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      entryHash,
      kind: "request",
      request
    };
  }

  private createResponseEntry(response: PredictionResponse): PredictionResponseLedgerEntry {
    const sequence = this.entries.length + 1;
    const previousHash = this.entries[this.entries.length - 1]?.entryHash;
    const recordedAt = new Date().toISOString();
    const hashInput = {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      kind: "response" as const,
      response
    };
    const entryHash = this.computeEntryHash(hashInput);

    return {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      entryHash,
      kind: "response",
      response
    };
  }

  private createResolutionEntry(
    resolution: PredictionResolutionLedgerRecord
  ): PredictionResolutionLedgerEntry {
    const sequence = this.entries.length + 1;
    const previousHash = this.entries[this.entries.length - 1]?.entryHash;
    const recordedAt = new Date().toISOString();
    const hashInput = {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      kind: "resolution" as const,
      resolution
    };
    const entryHash = this.computeEntryHash(hashInput);

    return {
      sequence,
      recordedAt,
      ...(previousHash ? { previousHash } : {}),
      entryHash,
      kind: "resolution",
      resolution
    };
  }

  private computeEntryHash(value: unknown): string {
    return createHash("sha256").update(canonicalizeJson(value)).digest("hex");
  }
}

function canonicalizeJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Ledger canonical JSON does not support non-finite numbers");
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

function clone<T>(value: T): T {
  return structuredClone(value);
}
