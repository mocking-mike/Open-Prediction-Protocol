import {
  createDidKeyIdentity,
  PredictionClient,
  X402PaymentProvider
} from "../src/index.js";
import { verifyPredictionResponseSignature } from "../src/security/identity.js";
import type { AgentCard, PredictionHandlerResult, PredictionRequest } from "../src/index.js";

import {
  createExampleAgent,
  readNumber,
  requireObjectContext,
  startExampleServer
} from "./_shared.js";

export const signedPaidWeatherAgentCard: AgentCard = {
  protocolVersion: "0.1.0",
  name: "signed-paid-weather-proxy",
  description: "Example OPP provider demonstrating signed responses and x402-priced access.",
  url: "http://127.0.0.1:3004",
  identity: {
    id: "signed-paid-weather-proxy"
  },
  capabilities: {
    predictions: [
      {
        id: "weather.precipitation.signed",
        domain: "weather.precipitation",
        title: "Signed daily precipitation probability",
        output: {
          type: "binary-probability"
        },
        horizons: ["24h"]
      }
    ]
  },
  pricing: {
    options: [
      {
        method: "x402",
        model: "per-request",
        amount: 0.01,
        currency: "USDC"
      }
    ]
  },
  calibration: {
    domains: [
      {
        domain: "weather.precipitation",
        scoreType: "brier",
        sampleSize: 24,
        score: 0.18,
        verificationStatus: "provisional"
      }
    ]
  }
};

export async function signedPaidWeatherHandler(
  request: PredictionRequest
): Promise<PredictionHandlerResult> {
  const context = requireObjectContext(request);
  const latitude = readNumber(context, "latitude", 52.2297);
  const longitude = readNumber(context, "longitude", 21.0122);

  return {
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: request.prediction.horizon,
      generatedAt: new Date().toISOString(),
      probability: latitude > 50 && longitude > 20 ? 0.58 : 0.33,
      rationale: "Deterministic signed forecast for local demo"
    },
    audit: {
      demo: true,
      paymentMethod: "x402"
    }
  };
}

async function main(): Promise<void> {
  const identity = createDidKeyIdentity();
  const exampleOptions = {
    identity,
    ...(signedPaidWeatherAgentCard.pricing
      ? { pricing: signedPaidWeatherAgentCard.pricing }
      : {}),
    paymentProviders: [
      new X402PaymentProvider({
        authorize: async () => ({
          method: "x402",
          authorized: true,
          metadata: {
            demo: true
          }
        })
      })
    ]
  };
  const predictionAgent = createExampleAgent(
    signedPaidWeatherAgentCard,
    signedPaidWeatherHandler,
    exampleOptions
  );
  const server = await startExampleServer(
    signedPaidWeatherAgentCard,
    signedPaidWeatherHandler,
    3004,
    exampleOptions
  );

  try {
    const client = new PredictionClient({
      verifySignature: true
    });
    const response = await client.request(
      {
        requestId: "signed-paid-demo-1",
        createdAt: new Date().toISOString(),
        consumer: {
          id: "demo-client",
          did: "did:key:z6MkhfakeRecipientDid"
        },
        prediction: {
          domain: "weather.precipitation",
          question: "Will it rain in Warsaw tomorrow?",
          horizon: "24h",
          desiredOutput: "binary-probability",
          context: {
            latitude: 52.2297,
            longitude: 21.0122
          }
        },
        payment: {
          preferredMethod: "x402"
        }
      },
      {
        send: async (request) => predictionAgent.handleRequest(request)
      }
    );

    console.log(
      JSON.stringify(
        {
          agentCard: {
            name: signedPaidWeatherAgentCard.name,
            pricing: signedPaidWeatherAgentCard.pricing
          },
          providerDid: identity.did,
          verified: response.status === "completed" ? verifyPredictionResponseSignature(response) : false,
          response
        },
        null,
        2
      )
    );
  } finally {
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
