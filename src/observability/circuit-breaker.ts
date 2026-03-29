import type {
  ConfidenceMonitorSignalResult
} from "./confidence-monitor.js";
import type { AgentCard } from "../types/index.js";

export type CircuitBreakerStatus = Exclude<ConfidenceMonitorSignalResult["status"], "insufficient-data">;
export type CircuitBreakerAction = "allow" | "fallback" | "reject";

export interface EvaluateProviderCircuitBreakerOptions {
  agentCard: AgentCard;
  monitor: ConfidenceMonitorSignalResult;
  fallbackProvider?: AgentCard;
  rejectOnStatus?: "warn" | "degraded";
}

export interface ProviderCircuitBreakerDecision {
  action: CircuitBreakerAction;
  providerId: string;
  fallbackProviderId?: string;
  reasons: string[];
}

export interface ProviderCircuitBreakerCandidate {
  agentCard: AgentCard;
  monitor: ConfidenceMonitorSignalResult;
  fallbackProvider?: AgentCard;
}

export interface SelectProviderWithCircuitBreakerOptions {
  candidates: ProviderCircuitBreakerCandidate[];
  rejectOnStatus?: "warn" | "degraded";
}

export interface ProviderSelectionResult {
  selectedProviderId?: string;
  decisions: ProviderCircuitBreakerDecision[];
}

export function evaluateProviderCircuitBreaker(
  options: EvaluateProviderCircuitBreakerOptions
): ProviderCircuitBreakerDecision {
  const providerId = getProviderId(options.agentCard);
  const reasons = options.monitor.signals.map((signal) => signal.message);
  const rejectOnStatus = options.rejectOnStatus ?? "degraded";
  const shouldReject = shouldTripCircuitBreaker(options.monitor.status, rejectOnStatus);

  if (!shouldReject) {
    return {
      action: "allow",
      providerId,
      reasons
    };
  }

  if (options.fallbackProvider) {
    return {
      action: "fallback",
      providerId,
      fallbackProviderId: getProviderId(options.fallbackProvider),
      reasons
    };
  }

  return {
    action: "reject",
    providerId,
    reasons
  };
}

export function selectProviderWithCircuitBreaker(
  options: SelectProviderWithCircuitBreakerOptions
): ProviderSelectionResult {
  const decisions: ProviderCircuitBreakerDecision[] = [];

  for (const candidate of options.candidates) {
    const decision = evaluateProviderCircuitBreaker({
      agentCard: candidate.agentCard,
      monitor: candidate.monitor,
      ...(candidate.fallbackProvider ? { fallbackProvider: candidate.fallbackProvider } : {}),
      ...(options.rejectOnStatus ? { rejectOnStatus: options.rejectOnStatus } : {})
    });
    decisions.push(decision);

    if (decision.action === "allow" || decision.action === "fallback") {
      return {
        selectedProviderId: decision.fallbackProviderId ?? decision.providerId,
        decisions
      };
    }
  }

  return {
    decisions
  };
}

function shouldTripCircuitBreaker(
  status: ConfidenceMonitorSignalResult["status"],
  rejectOnStatus: "warn" | "degraded"
): boolean {
  if (status === "insufficient-data" || status === "ok") {
    return false;
  }

  if (rejectOnStatus === "warn") {
    return status === "warn" || status === "degraded";
  }

  return status === "degraded";
}

function getProviderId(agentCard: AgentCard): string {
  return agentCard.identity?.id ?? agentCard.name;
}
