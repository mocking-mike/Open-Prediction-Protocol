import type { AgentIdentity } from "../types/index.js";

export type ConsensusStrategy = "majority" | "weighted";

export interface BinaryConsensusSubmission {
  scorer: AgentIdentity;
  outcome: boolean;
  weight?: number;
  responseId?: string;
  domain?: string;
}

export interface ResolveBinaryOutcomeConsensusOptions {
  responseId: string;
  requestId: string;
  domain: string;
  strategy?: ConsensusStrategy;
  submissions: BinaryConsensusSubmission[];
}

export interface BinaryOutcomeConsensusResult {
  responseId: string;
  requestId: string;
  domain: string;
  strategy: ConsensusStrategy;
  agreedOutcome: boolean;
  agreementRatio: number;
  participation: number;
  dissentingScorers: string[];
}

export interface ConsensusAgreementSummary {
  responseId: string;
  requestId: string;
  domain: string;
  agreedOutcome: boolean;
  agreementPercentage: number;
  participation: number;
  dissentCount: number;
}

export function resolveBinaryOutcomeConsensus(
  options: ResolveBinaryOutcomeConsensusOptions
): BinaryOutcomeConsensusResult {
  if (options.submissions.length === 0) {
    throw new Error("Consensus requires at least one scorer submission");
  }

  assertSubmissionsMatchTarget(options);
  const strategy = options.strategy ?? "majority";
  const trueWeight = sumWeights(options.submissions, true, strategy);
  const falseWeight = sumWeights(options.submissions, false, strategy);

  if (trueWeight === falseWeight) {
    throw new Error("Consensus could not resolve a single binary outcome");
  }

  const agreedOutcome = trueWeight > falseWeight;
  const winningWeight = agreedOutcome ? trueWeight : falseWeight;
  const totalWeight = trueWeight + falseWeight;
  const dissentingScorers = options.submissions
    .filter((submission) => submission.outcome !== agreedOutcome)
    .map((submission) => submission.scorer.id);

  return {
    responseId: options.responseId,
    requestId: options.requestId,
    domain: options.domain,
    strategy,
    agreedOutcome,
    agreementRatio: winningWeight / totalWeight,
    participation: options.submissions.length,
    dissentingScorers
  };
}

export function summarizeConsensusAgreement(
  result: BinaryOutcomeConsensusResult
): ConsensusAgreementSummary {
  return {
    responseId: result.responseId,
    requestId: result.requestId,
    domain: result.domain,
    agreedOutcome: result.agreedOutcome,
    agreementPercentage: result.agreementRatio * 100,
    participation: result.participation,
    dissentCount: result.dissentingScorers.length
  };
}

function assertSubmissionsMatchTarget(
  options: ResolveBinaryOutcomeConsensusOptions
): void {
  const scorerIds = new Set<string>();

  for (const submission of options.submissions) {
    if (submission.responseId && submission.responseId !== options.responseId) {
      throw new Error("Consensus submissions must target the same responseId and domain");
    }

    if (submission.domain && submission.domain !== options.domain) {
      throw new Error("Consensus submissions must target the same responseId and domain");
    }

    if (scorerIds.has(submission.scorer.id)) {
      throw new Error(`Duplicate scorer submission: ${submission.scorer.id}`);
    }

    scorerIds.add(submission.scorer.id);

    if (submission.weight !== undefined) {
      if (!Number.isFinite(submission.weight) || submission.weight <= 0) {
        throw new Error(`Consensus weight must be a positive finite number: ${submission.scorer.id}`);
      }
    }
  }
}

function sumWeights(
  submissions: BinaryConsensusSubmission[],
  outcome: boolean,
  strategy: ConsensusStrategy
): number {
  return submissions
    .filter((submission) => submission.outcome === outcome)
    .reduce((sum, submission) => sum + resolveWeight(submission, strategy), 0);
}

function resolveWeight(
  submission: BinaryConsensusSubmission,
  strategy: ConsensusStrategy
): number {
  if (strategy === "majority") {
    return 1;
  }

  return submission.weight ?? 1;
}
