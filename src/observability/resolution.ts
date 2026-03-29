import {
  type BinaryResolutionObservation,
  type CalibrationScoreType,
  updateAgentCardCalibration
} from "./metrics.js";
import type { AgentCard, PredictionResponse, VerificationStatus } from "../types/index.js";

type CompletedPredictionResponse = Extract<PredictionResponse, { status: "completed" }>;
type CompletedBinaryPredictionResponse = CompletedPredictionResponse & {
  forecast: Extract<CompletedPredictionResponse["forecast"], { type: "binary-probability" }>;
};

export interface CreateBinaryResolutionObservationOptions {
  outcome: boolean;
  resolvedAt?: string;
}

export interface ResolvePredictionOutcomeOptions extends CreateBinaryResolutionObservationOptions {
  agentCard: AgentCard;
  response: PredictionResponse;
  scoreType?: CalibrationScoreType;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string[];
}

export interface PredictionResolutionResult {
  domain: string;
  responseId: string;
  requestId: string;
  scoreType: CalibrationScoreType;
  observation: BinaryResolutionObservation;
  updatedAgentCard: AgentCard;
}

export function createBinaryResolutionObservation(
  response: PredictionResponse,
  options: CreateBinaryResolutionObservationOptions
): BinaryResolutionObservation {
  const binaryResponse = assertCompletedBinaryResponse(response);

  return {
    probability: binaryResponse.forecast.probability,
    outcome: options.outcome,
    ...(options.resolvedAt ? { resolvedAt: options.resolvedAt } : {})
  };
}

export function resolvePredictionOutcome(
  options: ResolvePredictionOutcomeOptions
): PredictionResolutionResult {
  const binaryResponse = assertCompletedBinaryResponse(options.response);
  assertResponseMatchesAgentCard(options.agentCard, binaryResponse);
  const scoreType = options.scoreType ?? "brier";
  const observation = createBinaryResolutionObservation(options.response, {
    outcome: options.outcome,
    ...(options.resolvedAt ? { resolvedAt: options.resolvedAt } : {})
  });

  const updatedAgentCard = updateAgentCardCalibration(options.agentCard, {
    domain: binaryResponse.forecast.domain,
    observation,
    scoreType,
    ...(options.verificationStatus
      ? { verificationStatus: options.verificationStatus }
      : {}),
    ...(options.verifiedBy?.length ? { verifiedBy: options.verifiedBy } : {})
  });

  return {
    domain: binaryResponse.forecast.domain,
    responseId: binaryResponse.responseId,
    requestId: binaryResponse.requestId,
    scoreType,
    observation,
    updatedAgentCard
  };
}

function assertCompletedBinaryResponse(
  response: PredictionResponse
): CompletedBinaryPredictionResponse {
  if (response.status !== "completed") {
    throw new Error("Only completed prediction responses can be resolved");
  }

  if (response.forecast.type !== "binary-probability") {
    throw new Error(
      "Resolution flow currently supports only completed binary-probability forecasts"
    );
  }

  return response as CompletedBinaryPredictionResponse;
}

function assertResponseMatchesAgentCard(
  agentCard: AgentCard,
  response: CompletedBinaryPredictionResponse
): void {
  const advertisedId = agentCard.identity?.id ?? agentCard.name;
  if (response.provider.id !== advertisedId) {
    throw new Error(
      `Prediction response provider does not match AgentCard identity: ${response.provider.id}`
    );
  }

  if (agentCard.identity?.did && response.provider.did && response.provider.did !== agentCard.identity.did) {
    throw new Error(
      `Prediction response provider DID does not match AgentCard identity DID: ${response.provider.did}`
    );
  }
}
