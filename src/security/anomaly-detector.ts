import type {
  ConfidenceMonitorSignalResult
} from "../observability/confidence-monitor.js";
import type { BinaryOutcomeConsensusResult } from "../scoring/consensus.js";
import type { PredictionResponse } from "../types/index.js";

export type PredictionAnomalyKind =
  | "low-consensus"
  | "stale-freshness"
  | "recipient-mismatch"
  | "monitor-degraded";

export type PredictionAnomalySeverity = "warn" | "degraded";

export interface PredictionAnomalySignal {
  kind: PredictionAnomalyKind;
  severity: PredictionAnomalySeverity;
  message: string;
  value: number;
  threshold: number;
}

export interface PredictionAnomalyResult {
  status: "ok" | "warn" | "degraded";
  signals: PredictionAnomalySignal[];
}

export interface PredictionAnomalySummary {
  status: PredictionAnomalyResult["status"];
  signalCount: number;
  kinds: PredictionAnomalyKind[];
}

export interface DetectPredictionAnomaliesOptions {
  response: PredictionResponse;
  consensus?: BinaryOutcomeConsensusResult;
  monitor?: ConfidenceMonitorSignalResult;
  expectedRecipientDid?: string;
  minConsensusAgreementRatio?: number;
  maxFreshnessAgeMs?: number;
  now?: () => number;
}

export function detectPredictionAnomalies(
  options: DetectPredictionAnomaliesOptions
): PredictionAnomalyResult {
  const signals: PredictionAnomalySignal[] = [];
  const minConsensusAgreementRatio = options.minConsensusAgreementRatio ?? 0.66;
  const maxFreshnessAgeMs = options.maxFreshnessAgeMs ?? 60 * 60 * 1000;
  const now = options.now ?? Date.now;

  if (options.consensus && options.consensus.agreementRatio < minConsensusAgreementRatio) {
    signals.push({
      kind: "low-consensus",
      severity: "warn",
      message:
        `Consensus agreement ratio ${formatMetric(options.consensus.agreementRatio)} ` +
        `is below minimum ${formatMetric(minConsensusAgreementRatio)}`,
      value: options.consensus.agreementRatio,
      threshold: minConsensusAgreementRatio
    });
  }

  const freshnessTimestamp = options.response.freshness?.timestamp;
  if (freshnessTimestamp) {
    const freshnessAgeMs = now() - Date.parse(freshnessTimestamp);
    if (Number.isFinite(freshnessAgeMs) && freshnessAgeMs > maxFreshnessAgeMs) {
      signals.push({
        kind: "stale-freshness",
        severity: "warn",
        message:
          `Response freshness age ${freshnessAgeMs}ms exceeds maximum ${maxFreshnessAgeMs}ms`,
        value: freshnessAgeMs,
        threshold: maxFreshnessAgeMs
      });
    }
  }

  if (
    options.expectedRecipientDid &&
    options.response.signature &&
    options.response.freshness?.recipientDid !== options.expectedRecipientDid
  ) {
    signals.push({
      kind: "recipient-mismatch",
      severity: "warn",
      message: "Signed response freshness is missing expected recipient DID binding",
      value: 0,
      threshold: 1
    });
  }

  if (options.monitor?.status === "degraded") {
    signals.push({
      kind: "monitor-degraded",
      severity: "warn",
      message: "Confidence monitoring reported degraded status",
      value: 1,
      threshold: 0
    });
  }

  return {
    status: deriveStatus(signals),
    signals
  };
}

export function summarizePredictionAnomalies(
  result: PredictionAnomalyResult
): PredictionAnomalySummary {
  return {
    status: result.status,
    signalCount: result.signals.length,
    kinds: result.signals.map((signal) => signal.kind)
  };
}

function deriveStatus(
  signals: PredictionAnomalySignal[]
): PredictionAnomalyResult["status"] {
  if (signals.some((signal) => signal.severity === "degraded")) {
    return "degraded";
  }

  if (signals.length > 0) {
    return "warn";
  }

  return "ok";
}

function formatMetric(value: number): string {
  return value.toFixed(4);
}
