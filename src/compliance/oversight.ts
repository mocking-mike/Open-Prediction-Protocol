import type { AgentCard, PredictionRequest } from "../types/index.js";

export type OversightStatus = "allowed" | "requires-review" | "overridden" | "stopped";

export interface OversightDecision {
  requestId: string;
  status: OversightStatus;
  reasons?: string[];
  actor?: string;
  reason?: string;
}

export interface EvaluateOversightRequirementOptions {
  request: PredictionRequest;
  agentCard: AgentCard;
}

export interface RecordOversightReviewOptions {
  requestId: string;
  status: "allowed" | "requires-review";
  reasons?: string[];
}

export interface OversightActionOptions {
  requestId: string;
  actor: string;
  reason: string;
}

export function evaluateOversightRequirement(
  options: EvaluateOversightRequirementOptions
): OversightDecision {
  const reasons: string[] = [];
  const humanOversightRequired =
    options.request.constraints?.compliance?.humanOversightRequired === true;
  const providerSupportsOversight = options.agentCard.compliance?.humanOversight === true;

  if (humanOversightRequired && !providerSupportsOversight) {
    reasons.push("Request requires human oversight but provider does not declare support");
  }

  return {
    requestId: options.request.requestId,
    status: reasons.length === 0 ? "allowed" : "requires-review",
    ...(reasons.length > 0 ? { reasons } : { reasons: [] })
  };
}

export class InMemoryOversightController {
  private readonly decisions = new Map<string, OversightDecision>();

  recordReview(options: RecordOversightReviewOptions): OversightDecision {
    const decision: OversightDecision = {
      requestId: options.requestId,
      status: options.status,
      reasons: options.reasons ?? []
    };
    this.decisions.set(options.requestId, decision);
    return clone(decision);
  }

  override(options: OversightActionOptions): OversightDecision {
    const decision: OversightDecision = {
      requestId: options.requestId,
      status: "overridden",
      actor: options.actor,
      reason: options.reason
    };
    this.decisions.set(options.requestId, decision);
    return clone(decision);
  }

  stop(options: OversightActionOptions): OversightDecision {
    const decision: OversightDecision = {
      requestId: options.requestId,
      status: "stopped",
      actor: options.actor,
      reason: options.reason
    };
    this.decisions.set(options.requestId, decision);
    return clone(decision);
  }

  getDecision(requestId: string): OversightDecision | undefined {
    const decision = this.decisions.get(requestId);
    return decision ? clone(decision) : undefined;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
