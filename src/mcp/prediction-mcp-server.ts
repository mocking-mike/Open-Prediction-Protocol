import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { PredictionAggregator, type AggregationProvider } from "../client/aggregator.js";
import { PredictionClient } from "../client/index.js";
import type { AgentCard, PredictionRequest, PredictionResponse } from "../types/index.js";

const implementation = {
  name: "open-prediction-protocol",
  version: "0.1.0"
} as const;

const domainPattern = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;
const capabilityIdPattern = /^[a-z0-9][a-z0-9._-]*$/;

const forecastTypeSchema = z.enum([
  "binary-probability",
  "categorical-distribution",
  "numeric-range"
]);

const verificationStatusSchema = z.enum(["self-reported", "provisional", "verified"]);
const paymentMethodSchema = z.enum(["free", "x402", "stripe", "custom"]);
const privacyModeSchema = z.enum(["plain", "committed"]);
const privacySchema = z.object({
  mode: privacyModeSchema.optional(),
  commitment: z.object({
    scheme: z.literal("opp-hmac-sha256-v1"),
    question: z.string().min(1),
    context: z.string().min(1),
    resolution: z.string().min(1).optional(),
    redactedKeys: z.array(z.string().min(1)).optional()
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.mode === "committed" && !value.commitment) {
    context.addIssue({
      code: "custom",
      path: ["commitment"],
      message: "commitment is required when privacy.mode is committed"
    });
  }

  if (value.commitment && value.mode !== "committed") {
    context.addIssue({
      code: "custom",
      path: ["mode"],
      message: "privacy.mode must be committed when commitment metadata is present"
    });
  }
});

const agentIdentitySchema = z.object({
  id: z.string().min(1),
  did: z.string().optional()
}).strict();

export const predictionRequestInputSchema = z.object({
  requestId: z.string().min(1),
  createdAt: z.iso.datetime(),
  consumer: agentIdentitySchema,
  prediction: z.object({
    domain: z.string().regex(domainPattern),
    question: z.string().min(1),
    horizon: z.string().min(1),
    desiredOutput: forecastTypeSchema,
    resolution: z.string().min(1).optional(),
    context: z.record(z.string(), z.unknown()).optional()
  }).strict(),
  constraints: z.object({
    maxLatencyMs: z.int().min(1).optional(),
    maxPrice: z.number().min(0).optional(),
    minVerificationStatus: verificationStatusSchema.optional(),
    compliance: z.object({
      humanOversightRequired: z.boolean().optional()
    }).strict().optional()
  }).strict().optional(),
  privacy: privacySchema.optional(),
  payment: z.object({
    preferredMethod: paymentMethodSchema.optional()
  }).strict().optional()
}).strict();

const aggregationStrategySchema = z.enum(["equal-weight", "calibration-weighted"]);

export interface PredictionMcpProvider extends AggregationProvider {
  id: string;
}

export interface PredictionMcpServerOptions {
  providers: PredictionMcpProvider[];
  instructions?: string;
  client?: PredictionClient;
  aggregator?: PredictionAggregator;
}

export function createPredictionMcpServer(
  options: PredictionMcpServerOptions
): McpServer {
  const client = options.client ?? new PredictionClient();
  const aggregator = options.aggregator ?? new PredictionAggregator(client);
  const providerMap = new Map(options.providers.map((provider) => [provider.id, provider]));

  const server = new McpServer(implementation, {
    instructions:
      options.instructions ??
      "Use these tools to discover OPP providers, request forecasts from one provider, or aggregate forecasts across compatible providers."
  });

  server.registerTool(
    "list_providers",
    {
      title: "List OPP Providers",
      description: "List configured OPP prediction providers and their advertised capabilities.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const providers = options.providers.map((provider) => ({
        id: provider.id,
        name: provider.agentCard.name,
        url: provider.agentCard.url,
        capabilities: provider.agentCard.capabilities.predictions,
        pricing: provider.agentCard.pricing?.options ?? [],
        calibration: provider.agentCard.calibration?.domains ?? []
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(providers, null, 2)
          }
        ],
        structuredContent: {
          providers
        }
      };
    }
  );

  server.registerTool(
    "request_prediction",
    {
      title: "Request Prediction",
      description: "Send one OPP prediction request to a specific configured provider.",
      inputSchema: {
        providerId: z.string(),
        request: predictionRequestInputSchema
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ providerId, request }) => {
      const provider = providerMap.get(providerId);
      if (!provider) {
        return toolError(`Unknown provider: ${providerId}`);
      }

      const validatedAgentCard = client.validateAgentCard(provider.agentCard);
      const response = await client.request(
        request as PredictionRequest,
        provider.transport,
        validatedAgentCard
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                provider: {
                  id: providerId,
                  name: validatedAgentCard.name
                },
                response
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          provider: {
            id: providerId,
            name: validatedAgentCard.name
          },
          response
        }
      };
    }
  );

  server.registerTool(
    "aggregate_predictions",
    {
      title: "Aggregate Predictions",
      description: "Fan out one OPP request across configured providers and merge compatible results.",
      inputSchema: {
        providerIds: z.array(z.string()).optional(),
        strategy: aggregationStrategySchema.optional(),
        request: predictionRequestInputSchema
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ providerIds, strategy, request }) => {
      const providers = resolveProviders(providerIds, providerMap);
      if (providers instanceof Error) {
        return toolError(providers.message);
      }

      const result = await aggregator.aggregate(request as PredictionRequest, providers, {
        ...(strategy ? { strategy } : {})
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: toStructuredContent(result)
      };
    }
  );

  return server;
}

export async function runPredictionMcpServer(
  options: PredictionMcpServerOptions
): Promise<void> {
  const server = createPredictionMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function resolveProviders(
  providerIds: string[] | undefined,
  providerMap: Map<string, PredictionMcpProvider>
): AggregationProvider[] | Error {
  if (!providerIds?.length) {
    return Array.from(providerMap.values());
  }

  const providers: PredictionMcpProvider[] = [];
  for (const providerId of providerIds) {
    const provider = providerMap.get(providerId);
    if (!provider) {
      return new Error(`Unknown provider: ${providerId}`);
    }
    providers.push(provider);
  }

  return providers;
}

function toolError(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message
      }
    ],
    isError: true
  };
}

function toStructuredContent(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export type {
  AgentCard,
  PredictionRequest,
  PredictionResponse
};
