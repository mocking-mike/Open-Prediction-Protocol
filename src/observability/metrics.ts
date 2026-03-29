import type { AgentCard, DomainCalibration, VerificationStatus } from "../types/index.js";

export type CalibrationScoreType = DomainCalibration["scoreType"];

export interface BinaryResolutionObservation {
  probability: number;
  outcome: boolean;
  resolvedAt?: string;
}

export interface CreateDomainCalibrationSnapshotOptions {
  domain: string;
  scoreType: CalibrationScoreType;
  verificationStatus: VerificationStatus;
  observations: BinaryResolutionObservation[];
  verifiedBy?: string[];
}

export interface UpdateAgentCardCalibrationOptions {
  domain: string;
  observation: BinaryResolutionObservation;
  scoreType?: CalibrationScoreType;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string[];
}

const MIN_PROBABILITY = 1e-12;

export function calculateBinaryBrierScore(probability: number, outcome: boolean): number {
  assertProbability(probability);
  const resolvedOutcome = outcome ? 1 : 0;
  return (probability - resolvedOutcome) ** 2;
}

export function calculateBinaryLogScore(probability: number, outcome: boolean): number {
  assertProbability(probability);
  const boundedProbability = clampProbability(probability);
  return outcome ? -Math.log(boundedProbability) : -Math.log(1 - boundedProbability);
}

export function createDomainCalibrationSnapshot(
  options: CreateDomainCalibrationSnapshotOptions
): DomainCalibration {
  if (options.observations.length === 0) {
    throw new Error("At least one observation is required to create calibration metadata");
  }

  let scoreSum = 0;
  const coverage = computeCoverage(options.observations);
  for (const observation of options.observations) {
    scoreSum += calculateBinaryScore(options.scoreType, observation);
  }

  const calibration: DomainCalibration = {
    domain: options.domain,
    scoreType: options.scoreType,
    score: scoreSum / options.observations.length,
    sampleSize: options.observations.length,
    verificationStatus: options.verificationStatus
  };

  if (options.verifiedBy?.length) {
    calibration.verifiedBy = [...options.verifiedBy];
  }

  if (coverage) {
    calibration.coverage = coverage;
  }

  return calibration;
}

export function applyCalibrationObservation(
  calibration: DomainCalibration,
  observation: BinaryResolutionObservation
): DomainCalibration {
  if (calibration.sampleSize > 0 && calibration.score == null) {
    throw new Error("Cannot update calibration metadata without an existing aggregate score");
  }

  const nextScore = calculateBinaryScore(calibration.scoreType, observation);
  const previousScore = calibration.score ?? 0;
  const previousSampleSize = calibration.sampleSize;
  const sampleSize = previousSampleSize + 1;
  const score = ((previousScore * previousSampleSize) + nextScore) / sampleSize;
  const nextCoverage = extendCoverage(calibration.coverage, observation.resolvedAt);

  return {
    ...calibration,
    score,
    sampleSize,
    ...(nextCoverage ? { coverage: nextCoverage } : {})
  };
}

export function updateAgentCardCalibration(
  agentCard: AgentCard,
  options: UpdateAgentCardCalibrationOptions
): AgentCard {
  assertAgentCardSupportsDomain(agentCard, options.domain);
  assertResolvedAt(options.observation.resolvedAt);

  const existingDomains = agentCard.calibration?.domains ?? [];
  const existingCalibration = existingDomains.find((entry) => entry.domain === options.domain);

  const nextCalibration = existingCalibration
    ? mergeCalibrationMetadata(
        applyCalibrationObservation(existingCalibration, options.observation),
        options
      )
    : createDomainCalibrationSnapshot({
        domain: options.domain,
        scoreType: options.scoreType ?? "brier",
        verificationStatus: options.verificationStatus ?? "self-reported",
        ...(options.verifiedBy?.length ? { verifiedBy: options.verifiedBy } : {}),
        observations: [options.observation]
      });

  const domains = existingCalibration
    ? existingDomains.map((entry) => (entry.domain === options.domain ? nextCalibration : entry))
    : [...existingDomains, nextCalibration];

  return {
    ...agentCard,
    calibration: {
      domains
    }
  };
}

function mergeCalibrationMetadata(
  calibration: DomainCalibration,
  options: UpdateAgentCardCalibrationOptions
): DomainCalibration {
  const nextCalibration: DomainCalibration = {
    ...calibration,
    ...(options.verificationStatus
      ? { verificationStatus: options.verificationStatus }
      : {}),
    ...(options.verifiedBy?.length ? { verifiedBy: [...options.verifiedBy] } : {})
  };

  if (options.scoreType && options.scoreType !== calibration.scoreType) {
    throw new Error("Cannot change calibration scoreType for an existing domain entry");
  }

  return nextCalibration;
}

function calculateBinaryScore(
  scoreType: CalibrationScoreType,
  observation: BinaryResolutionObservation
): number {
  assertResolvedAt(observation.resolvedAt);
  return scoreType === "brier"
    ? calculateBinaryBrierScore(observation.probability, observation.outcome)
    : calculateBinaryLogScore(observation.probability, observation.outcome);
}

function assertProbability(probability: number): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("Probability must be a finite number between 0 and 1");
  }
}

function clampProbability(probability: number): number {
  return Math.min(1 - MIN_PROBABILITY, Math.max(MIN_PROBABILITY, probability));
}

function computeCoverage(
  observations: BinaryResolutionObservation[]
): DomainCalibration["coverage"] | undefined {
  const resolvedTimes = observations
    .map((observation) => observation.resolvedAt)
    .filter((value): value is string => typeof value === "string")
    .sort();

  if (resolvedTimes.length === 0) {
    return undefined;
  }

  return {
    from: resolvedTimes[0]!,
    to: resolvedTimes[resolvedTimes.length - 1]!
  };
}

function extendCoverage(
  coverage: DomainCalibration["coverage"] | undefined,
  resolvedAt: string | undefined
): DomainCalibration["coverage"] | undefined {
  if (!resolvedAt) {
    return coverage;
  }

  if (!coverage) {
    return {
      from: resolvedAt,
      to: resolvedAt
    };
  }

  const nextCoverage: NonNullable<DomainCalibration["coverage"]> = {};
  nextCoverage.from = coverage.from && coverage.from < resolvedAt ? coverage.from : resolvedAt;
  nextCoverage.to = coverage.to && coverage.to > resolvedAt ? coverage.to : resolvedAt;

  return nextCoverage;
}

function assertAgentCardSupportsDomain(agentCard: AgentCard, domain: string): void {
  const supported = agentCard.capabilities.predictions.some((capability) => capability.domain === domain);
  if (!supported) {
    throw new Error(`AgentCard does not advertise calibration domain: ${domain}`);
  }
}

function assertResolvedAt(resolvedAt: string | undefined): void {
  if (resolvedAt === undefined) {
    return;
  }

  const dateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!dateTimePattern.test(resolvedAt) || Number.isNaN(Date.parse(resolvedAt))) {
    throw new Error(`resolvedAt must be a valid date-time: ${resolvedAt}`);
  }
}
