import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { AgentCard, PredictionRequest, PredictionResponse } from "../types/index.js";

type AjvLike = {
  compile: <T>(schema: object) => ValidateFunction<T>;
};
type AjvCtor = new (options: Record<string, unknown>) => AjvLike;

function readSchema(relativePath: string): object {
  const schemaUrl = new URL(relativePath, import.meta.url);
  const contents = readFileSync(fileURLToPath(schemaUrl), "utf8");
  return JSON.parse(contents) as object;
}

const Ajv2020Ctor = Ajv2020 as unknown as AjvCtor;
const ajv = new Ajv2020Ctor({
  allErrors: true,
  strict: true,
  validateFormats: false
});

const agentCardSchema = readSchema("../../spec/agent-card.schema.json");
const predictionRequestSchema = readSchema("../../spec/prediction-request.schema.json");
const predictionResponseSchema = readSchema("../../spec/prediction-response.schema.json");

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

export function assertValidAgentCard(value: unknown): asserts value is AgentCard {
  if (!validateAgentCard(value)) {
    throw new Error(formatValidationErrors(validateAgentCard.errors).join("; "));
  }
}

export function assertValidPredictionRequest(value: unknown): asserts value is PredictionRequest {
  if (!validatePredictionRequest(value)) {
    throw new Error(formatValidationErrors(validatePredictionRequest.errors).join("; "));
  }
}

export function assertValidPredictionResponse(value: unknown): asserts value is PredictionResponse {
  if (!validatePredictionResponse(value)) {
    throw new Error(formatValidationErrors(validatePredictionResponse.errors).join("; "));
  }
}

export {
  agentCardSchema,
  predictionRequestSchema,
  predictionResponseSchema
};
