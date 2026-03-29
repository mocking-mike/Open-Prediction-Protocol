import { PredictionAgent } from "../src/agent/index.js";
import { PredictionHttpServer } from "../src/server/index.js";
import type {
  AgentCard,
  PaymentProvider,
  PredictionAgentOptions,
  PredictionHandlerResult,
  PredictionRequest,
  PricingOption,
  RateLimiter
} from "../src/index.js";
import type { DidKeyIdentity } from "../src/security/identity.js";

export type ExampleHandler = (
  request: PredictionRequest
) => Promise<PredictionHandlerResult> | PredictionHandlerResult;

export interface ExampleAgentOptions {
  pricing?: {
    options: PricingOption[];
  };
  paymentProviders?: PaymentProvider[];
  identity?: Pick<DidKeyIdentity, "did" | "privateKey">;
  rateLimiter?: RateLimiter;
}

export function createExampleAgent(
  agentCard: AgentCard,
  handler: ExampleHandler,
  options: ExampleAgentOptions = {}
): PredictionAgent {
  const agentOptions: PredictionAgentOptions = {
    provider: {
      id: agentCard.identity?.id ?? agentCard.name
    },
    handler,
    ...(options.pricing ? { pricing: options.pricing } : {}),
    ...(options.paymentProviders ? { paymentProviders: options.paymentProviders } : {}),
    ...(options.identity ? { identity: options.identity } : {}),
    ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {})
  };

  return new PredictionAgent(agentOptions);
}

export async function startExampleServer(
  agentCard: AgentCard,
  handler: ExampleHandler,
  port: number,
  options: ExampleAgentOptions = {}
): Promise<PredictionHttpServer> {
  const server = new PredictionHttpServer({
    agentCard,
    predictionAgent: createExampleAgent(agentCard, handler, options)
  });

  await server.listen(port);
  return server;
}

export function requireObjectContext(request: PredictionRequest): Record<string, unknown> {
  if (!request.prediction.context || typeof request.prediction.context !== "object") {
    throw new Error("prediction.context object is required for this example provider");
  }

  return request.prediction.context;
}

export function readString(
  context: Record<string, unknown>,
  key: string,
  fallback?: string
): string {
  const value = context[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing string context field: ${key}`);
}

export function readNumber(
  context: Record<string, unknown>,
  key: string,
  fallback?: number
): number {
  const value = context[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing numeric context field: ${key}`);
}
