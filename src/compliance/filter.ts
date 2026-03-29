import type { AgentCard, PredictionRequest } from "../types/index.js";

const RISK_ORDER = ["minimal", "limited", "high", "unknown"] as const;

export type ComplianceRiskLevel = NonNullable<NonNullable<AgentCard["compliance"]>["riskLevel"]>;

export interface ComplianceDecision {
  allowed: boolean;
  providerId: string;
  reasons: string[];
}

export interface EvaluateProviderComplianceOptions {
  agentCard: AgentCard;
  request?: PredictionRequest;
  maxRiskLevel?: Exclude<ComplianceRiskLevel, "unknown">;
}

export interface FilterProvidersByComplianceOptions {
  providers: AgentCard[];
  request?: PredictionRequest;
  maxRiskLevel?: Exclude<ComplianceRiskLevel, "unknown">;
}

export interface ComplianceFilterResult {
  allowedProviders: AgentCard[];
  decisions: ComplianceDecision[];
}

export function evaluateProviderCompliance(
  options: EvaluateProviderComplianceOptions
): ComplianceDecision {
  const reasons: string[] = [];
  const providerId = options.agentCard.identity?.id ?? options.agentCard.name;
  const riskLevel = options.agentCard.compliance?.riskLevel ?? "unknown";
  const humanOversight = options.agentCard.compliance?.humanOversight;
  const humanOversightRequired = options.request?.constraints?.compliance?.humanOversightRequired;

  if (options.maxRiskLevel && exceedsRiskLevel(riskLevel, options.maxRiskLevel)) {
    reasons.push(
      `Provider risk level ${riskLevel} exceeds allowed maximum ${options.maxRiskLevel}`
    );
  }

  if (humanOversightRequired && humanOversight !== true) {
    reasons.push("Provider does not declare required human oversight support");
  }

  return {
    allowed: reasons.length === 0,
    providerId,
    reasons
  };
}

export function filterProvidersByCompliance(
  options: FilterProvidersByComplianceOptions
): ComplianceFilterResult {
  const decisions = options.providers.map((agentCard) =>
    evaluateProviderCompliance({
      agentCard,
      ...(options.request ? { request: options.request } : {}),
      ...(options.maxRiskLevel ? { maxRiskLevel: options.maxRiskLevel } : {})
    })
  );

  const allowedProviders = options.providers.filter((provider) => {
    const providerId = provider.identity?.id ?? provider.name;
    return decisions.some((decision) => decision.providerId === providerId && decision.allowed);
  });

  return {
    allowedProviders,
    decisions
  };
}

function exceedsRiskLevel(
  providerRiskLevel: ComplianceRiskLevel,
  maxRiskLevel: Exclude<ComplianceRiskLevel, "unknown">
): boolean {
  const providerRank = RISK_ORDER.indexOf(providerRiskLevel);
  const maxRank = RISK_ORDER.indexOf(maxRiskLevel);

  if (providerRank === -1 || maxRank === -1) {
    return true;
  }

  return providerRank > maxRank;
}
