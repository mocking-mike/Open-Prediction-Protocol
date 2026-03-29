import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { AgentCard, PredictionRequest, PredictionResponse } from "../types/index.js";
import agentCardSchema from "../../spec/agent-card.schema.json" with { type: "json" };
import predictionRequestSchema from "../../spec/prediction-request.schema.json" with { type: "json" };
import predictionResponseSchema from "../../spec/prediction-response.schema.json" with { type: "json" };

type AjvLike = {
  addFormat: (name: string, validator: { validate: (value: string) => boolean }) => AjvLike;
  compile: <T>(schema: object) => ValidateFunction<T>;
};
type AjvCtor = new (options: Record<string, unknown>) => AjvLike;

const Ajv2020Ctor = Ajv2020 as unknown as AjvCtor;
const ajv = new Ajv2020Ctor({
  allErrors: true,
  strict: true,
  validateFormats: true
});

ajv.addFormat("date-time", {
  validate: (value: string) => {
    if (typeof value !== "string") {
      return false;
    }

    const dateTimePattern =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    if (!dateTimePattern.test(value)) {
      return false;
    }

    return !Number.isNaN(Date.parse(value));
  }
});

ajv.addFormat("uri", {
  validate: (value: string) => {
    if (typeof value !== "string") {
      return false;
    }

    try {
      const parsed = new URL(value);
      return parsed.protocol.length > 0 && parsed.host.length > 0;
    } catch {
      return false;
    }
  }
});

function compileValidator<T>(schema: object): ValidateFunction<T> {
  return ajv.compile<T>(schema);
}

export const validateAgentCard = compileValidator<AgentCard>(agentCardSchema);
export const validatePredictionRequest =
  compileValidator<PredictionRequest>(predictionRequestSchema);
export const validatePredictionResponse =
  compileValidator<PredictionResponse>(predictionResponseSchema);

export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map(
    (error) => `${error.instancePath || "/"} ${error.message ?? "validation error"}`
  );
}

export class SchemaValidationError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super(details.join("; "));
    this.name = "SchemaValidationError";
    this.details = [...details];
  }
}

export function assertValidAgentCard(value: unknown): asserts value is AgentCard {
  if (!validateAgentCard(value)) {
    throw new SchemaValidationError(formatValidationErrors(validateAgentCard.errors));
  }
}

export function assertValidPredictionRequest(value: unknown): asserts value is PredictionRequest {
  if (!validatePredictionRequest(value)) {
    throw new SchemaValidationError(formatValidationErrors(validatePredictionRequest.errors));
  }
}

export function assertValidPredictionResponse(value: unknown): asserts value is PredictionResponse {
  if (!validatePredictionResponse(value)) {
    throw new SchemaValidationError(formatValidationErrors(validatePredictionResponse.errors));
  }
}

export {
  agentCardSchema,
  predictionRequestSchema,
  predictionResponseSchema
};
