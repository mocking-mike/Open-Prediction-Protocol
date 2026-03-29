import type { GoldenTaskEvaluationResult } from "./golden-tasks.js";
import type { CalibrationScoreType } from "./metrics.js";

export interface DomainConfidenceMetrics {
  evaluations: number;
  averageConfidence: number;
  outcomeRate: number;
  confidenceGap: number;
}

export interface ConfidenceMonitorSnapshot {
  totalEvaluations: number;
  averageConfidence: number;
  outcomeRate: number;
  confidenceGap: number;
  averageScores: Partial<Record<CalibrationScoreType, number>>;
  domains: string[];
  domainBreakdown: Record<string, DomainConfidenceMetrics>;
}

export type ConfidenceMonitorSignalKind =
  | "insufficient-data"
  | "confidence-gap"
  | "score-drift";

export type ConfidenceMonitorSeverity = "info" | "warn" | "degraded";

export interface ConfidenceMonitorSignal {
  kind: ConfidenceMonitorSignalKind;
  severity: ConfidenceMonitorSeverity;
  message: string;
  value: number;
  threshold: number;
}

export interface DetectConfidenceMonitorSignalsOptions {
  baseline?: ConfidenceMonitorSnapshot;
  minEvaluations?: number;
  confidenceGapThreshold?: number;
  scoreDriftThreshold?: number;
}

export interface ConfidenceMonitorSignalResult {
  status: "ok" | "warn" | "degraded" | "insufficient-data";
  signals: ConfidenceMonitorSignal[];
}

export function createConfidenceMonitorSnapshot(
  evaluations: GoldenTaskEvaluationResult[]
): ConfidenceMonitorSnapshot {
  const totalEvaluations = evaluations.length;
  const averageConfidence = averageOf(
    evaluations.map((evaluation) => evaluation.observation.probability)
  );
  const outcomeRate = averageOf(
    evaluations.map((evaluation) => (evaluation.observation.outcome ? 1 : 0))
  );
  const domainBreakdown = createDomainBreakdown(evaluations);

  return {
    totalEvaluations,
    averageConfidence,
    outcomeRate,
    confidenceGap: Math.abs(averageConfidence - outcomeRate),
    averageScores: createAverageScores(evaluations),
    domains: Object.keys(domainBreakdown).sort(),
    domainBreakdown
  };
}

export function detectConfidenceMonitorSignals(
  snapshot: ConfidenceMonitorSnapshot,
  options: DetectConfidenceMonitorSignalsOptions = {}
): ConfidenceMonitorSignalResult {
  const minEvaluations = options.minEvaluations ?? 10;
  if (snapshot.totalEvaluations < minEvaluations) {
    return {
      status: "insufficient-data",
      signals: [
        {
          kind: "insufficient-data",
          severity: "info",
          message: `Confidence monitoring requires at least ${minEvaluations} evaluations`,
          value: snapshot.totalEvaluations,
          threshold: minEvaluations
        }
      ]
    };
  }

  const signals: ConfidenceMonitorSignal[] = [];
  const confidenceGapThreshold = options.confidenceGapThreshold ?? 0.15;
  if (snapshot.confidenceGap > confidenceGapThreshold) {
    signals.push({
      kind: "confidence-gap",
      severity: "warn",
      message:
        `Average confidence deviates from observed outcomes by ${formatMetric(snapshot.confidenceGap)}, ` +
        `above threshold ${formatMetric(confidenceGapThreshold)}`,
      value: snapshot.confidenceGap,
      threshold: confidenceGapThreshold
    });
  }

  const scoreDriftThreshold = options.scoreDriftThreshold ?? 0.1;
  if (options.baseline) {
    for (const scoreType of ["brier", "log"] as const) {
      const current = snapshot.averageScores[scoreType];
      const baseline = options.baseline.averageScores[scoreType];
      if (current == null || baseline == null) {
        continue;
      }

      const drift = current - baseline;
      if (drift > scoreDriftThreshold) {
        signals.push({
          kind: "score-drift",
          severity: "degraded",
          message:
            `Average ${scoreType} score drifted by ${formatMetric(drift)}, ` +
            `above threshold ${formatMetric(scoreDriftThreshold)}`,
          value: drift,
          threshold: scoreDriftThreshold
        });
      }
    }
  }

  return {
    status: deriveStatus(signals),
    signals
  };
}

function createAverageScores(
  evaluations: GoldenTaskEvaluationResult[]
): Partial<Record<CalibrationScoreType, number>> {
  const sums: Partial<Record<CalibrationScoreType, number>> = {};
  const counts: Partial<Record<CalibrationScoreType, number>> = {};

  for (const evaluation of evaluations) {
    sums[evaluation.scoreType] = (sums[evaluation.scoreType] ?? 0) + evaluation.score;
    counts[evaluation.scoreType] = (counts[evaluation.scoreType] ?? 0) + 1;
  }

  const averageScores: Partial<Record<CalibrationScoreType, number>> = {};
  for (const scoreType of ["brier", "log"] as const) {
    const count = counts[scoreType];
    if (!count) {
      continue;
    }

    averageScores[scoreType] = (sums[scoreType] ?? 0) / count;
  }

  return averageScores;
}

function createDomainBreakdown(
  evaluations: GoldenTaskEvaluationResult[]
): Record<string, DomainConfidenceMetrics> {
  const grouped = new Map<string, GoldenTaskEvaluationResult[]>();

  for (const evaluation of evaluations) {
    const existing = grouped.get(evaluation.domain);
    if (existing) {
      existing.push(evaluation);
    } else {
      grouped.set(evaluation.domain, [evaluation]);
    }
  }

  const breakdown: Record<string, DomainConfidenceMetrics> = {};
  for (const [domain, domainEvaluations] of grouped.entries()) {
    const averageConfidence = averageOf(
      domainEvaluations.map((evaluation) => evaluation.observation.probability)
    );
    const outcomeRate = averageOf(
      domainEvaluations.map((evaluation) => (evaluation.observation.outcome ? 1 : 0))
    );

    breakdown[domain] = {
      evaluations: domainEvaluations.length,
      averageConfidence,
      outcomeRate,
      confidenceGap: Math.abs(averageConfidence - outcomeRate)
    };
  }

  return breakdown;
}

function averageOf(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deriveStatus(
  signals: ConfidenceMonitorSignal[]
): ConfidenceMonitorSignalResult["status"] {
  if (signals.some((signal) => signal.severity === "degraded")) {
    return "degraded";
  }

  if (signals.some((signal) => signal.severity === "warn")) {
    return "warn";
  }

  return "ok";
}

function formatMetric(value: number): string {
  return value.toFixed(4);
}
