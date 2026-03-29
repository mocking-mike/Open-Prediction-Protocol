import type { PredictionRequest, PredictionResponse } from "../types/index.js";

type CompletedPredictionResponse = Extract<PredictionResponse, { status: "completed" }>;
type CompletedBinaryPredictionResponse = CompletedPredictionResponse & {
  forecast: Extract<CompletedPredictionResponse["forecast"], { type: "binary-probability" }>;
};

export interface ConditionalTriggerRule {
  id: string;
  sourceDomain: string;
  probabilityGte?: number;
  probabilityLte?: number;
  followUpRequest: PredictionRequest;
}

export interface TriggeredConditionalRequest {
  ruleId: string;
  request: PredictionRequest;
}

export function evaluateConditionalTrigger(
  rule: ConditionalTriggerRule,
  response: PredictionResponse
): TriggeredConditionalRequest | undefined {
  const binaryResponse = asCompletedBinaryResponse(response);
  if (!binaryResponse || binaryResponse.forecast.domain !== rule.sourceDomain) {
    return undefined;
  }

  const probability = binaryResponse.forecast.probability;
  if (rule.probabilityGte != null && probability < rule.probabilityGte) {
    return undefined;
  }

  if (rule.probabilityLte != null && probability > rule.probabilityLte) {
    return undefined;
  }

  return {
    ruleId: rule.id,
    request: {
      ...rule.followUpRequest,
      prediction: {
        ...rule.followUpRequest.prediction,
        context: {
          ...(rule.followUpRequest.prediction.context ?? {}),
          parentResponseId: binaryResponse.responseId,
          parentDomain: binaryResponse.forecast.domain
        }
      }
    }
  };
}

export class ConditionalTriggerRegistry {
  private readonly rules = new Map<string, ConditionalTriggerRule>();

  subscribe(rule: ConditionalTriggerRule): ConditionalTriggerRule {
    this.rules.set(rule.id, clone(rule));
    return clone(rule);
  }

  unsubscribe(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  evaluate(response: PredictionResponse): TriggeredConditionalRequest[] {
    return [...this.rules.values()]
      .map((rule) => evaluateConditionalTrigger(rule, response))
      .filter((value): value is TriggeredConditionalRequest => value != null);
  }
}

function asCompletedBinaryResponse(
  response: PredictionResponse
): CompletedBinaryPredictionResponse | undefined {
  if (response.status !== "completed" || response.forecast.type !== "binary-probability") {
    return undefined;
  }

  return response as CompletedBinaryPredictionResponse;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
