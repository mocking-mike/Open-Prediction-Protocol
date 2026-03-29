import {
  type PredictionResolutionResult,
  resolvePredictionOutcome
} from "./resolution.js";
import type {
  AgentCard,
  PredictionResponse,
  VerificationStatus
} from "../types/index.js";
import {
  calculateBinaryBrierScore,
  calculateBinaryLogScore,
  type CalibrationScoreType
} from "./metrics.js";

type CompletedPredictionResponse = Extract<PredictionResponse, { status: "completed" }>;
type CompletedBinaryPredictionResponse = CompletedPredictionResponse & {
  forecast: Extract<CompletedPredictionResponse["forecast"], { type: "binary-probability" }>;
};

export interface GoldenTaskDefinition {
  id: string;
  domain: string;
  question: string;
  horizon: string;
  expectedOutcome: boolean;
}

export interface EvaluateGoldenTaskOptions {
  agentCard: AgentCard;
  task: GoldenTaskDefinition;
  response: PredictionResponse;
  resolvedAt?: string;
  scoreType?: CalibrationScoreType;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string[];
}

export interface GoldenTaskEvaluationResult extends PredictionResolutionResult {
  taskId: string;
  score: number;
  correct: boolean;
}

export interface GoldenTaskEvaluationSummary {
  totalEvaluations: number;
  correctCount: number;
  accuracy: number;
  averageScores: Partial<Record<CalibrationScoreType, number>>;
  domains: string[];
}

export function evaluateGoldenTask(
  options: EvaluateGoldenTaskOptions
): GoldenTaskEvaluationResult {
  const response = assertGoldenTaskMatchesResponse(options.task, options.response);
  const resolution = resolvePredictionOutcome({
    agentCard: options.agentCard,
    response,
    outcome: options.task.expectedOutcome,
    ...(options.resolvedAt ? { resolvedAt: options.resolvedAt } : {}),
    ...(options.scoreType ? { scoreType: options.scoreType } : {}),
    verificationStatus: options.verificationStatus ?? "verified",
    ...(options.verifiedBy?.length ? { verifiedBy: options.verifiedBy } : {})
  });
  const score = calculateEvaluationScore(resolution);

  return {
    ...resolution,
    taskId: options.task.id,
    score,
    correct: isCorrectPrediction(
      resolution.observation.probability,
      options.task.expectedOutcome
    )
  };
}

export function summarizeGoldenTaskEvaluations(
  evaluations: GoldenTaskEvaluationResult[]
): GoldenTaskEvaluationSummary {
  const averageScores: Partial<Record<CalibrationScoreType, number>> = {};
  const scoreSums: Partial<Record<CalibrationScoreType, number>> = {};
  const scoreCounts: Partial<Record<CalibrationScoreType, number>> = {};
  const domains = new Set<string>();
  let correctCount = 0;

  for (const evaluation of evaluations) {
    domains.add(evaluation.domain);
    if (evaluation.correct) {
      correctCount += 1;
    }

    scoreSums[evaluation.scoreType] = (scoreSums[evaluation.scoreType] ?? 0) + evaluation.score;
    scoreCounts[evaluation.scoreType] = (scoreCounts[evaluation.scoreType] ?? 0) + 1;
  }

  for (const scoreType of ["brier", "log"] as const) {
    const count = scoreCounts[scoreType];
    if (!count) {
      continue;
    }

    averageScores[scoreType] = (scoreSums[scoreType] ?? 0) / count;
  }

  return {
    totalEvaluations: evaluations.length,
    correctCount,
    accuracy: evaluations.length === 0 ? 0 : correctCount / evaluations.length,
    averageScores,
    domains: [...domains].sort()
  };
}

function assertGoldenTaskMatchesResponse(
  task: GoldenTaskDefinition,
  response: PredictionResponse
): CompletedBinaryPredictionResponse {
  if (response.status !== "completed" || response.forecast.type !== "binary-probability") {
    throw new Error("Golden task evaluation requires a completed binary-probability response");
  }

  if (response.forecast.domain !== task.domain || response.forecast.horizon !== task.horizon) {
    throw new Error("Prediction response does not match golden task target");
  }

  return response as CompletedBinaryPredictionResponse;
}

function calculateEvaluationScore(resolution: PredictionResolutionResult): number {
  return resolution.scoreType === "brier"
    ? calculateBinaryBrierScore(
        resolution.observation.probability,
        resolution.observation.outcome
      )
    : calculateBinaryLogScore(
        resolution.observation.probability,
        resolution.observation.outcome
      );
}

function isCorrectPrediction(probability: number, outcome: boolean): boolean {
  return outcome ? probability >= 0.5 : probability < 0.5;
}
