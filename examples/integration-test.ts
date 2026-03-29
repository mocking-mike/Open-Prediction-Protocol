import { PredictionClient } from "../src/client/index.js";
import { HttpPredictionTransport } from "../src/client/http.js";

import { startExampleServer } from "./_shared.js";
import { weatherAgentCard } from "./weather-proxy.js";

async function main(): Promise<void> {
  const server = await startExampleServer(
    {
      ...weatherAgentCard,
      name: "integration-weather-provider",
      url: "http://127.0.0.1:3010"
    },
    async (request) => ({
      forecast: {
        type: "binary-probability",
        domain: request.prediction.domain,
        horizon: request.prediction.horizon,
        generatedAt: new Date().toISOString(),
        probability: 0.42,
        rationale: "Deterministic integration forecast"
      }
    }),
    3010
  );

  try {
    const client = new PredictionClient();
    const transport = new HttpPredictionTransport({
      baseUrl: "http://127.0.0.1:3010"
    });

    const agentCardResponse = await fetch("http://127.0.0.1:3010/.well-known/agent.json");
    const healthResponse = await fetch("http://127.0.0.1:3010/health");

    const agentCard = await agentCardResponse.json();
    const health = (await healthResponse.json()) as { status: string };
    client.validateAgentCard(agentCard);

    if (health.status !== "ok") {
      throw new Error("Health check failed");
    }

    const response = await client.request(
      {
        requestId: "integration-weather-1",
        createdAt: new Date().toISOString(),
        consumer: {
          id: "integration-client"
        },
        prediction: {
          domain: "weather.precipitation",
          question: "Will precipitation occur in Warsaw tomorrow?",
          horizon: "24h",
          desiredOutput: "binary-probability",
          context: {
            latitude: 52.2297,
            longitude: 21.0122,
            dayOffset: 1
          }
        }
      },
      transport
    );

    console.log(
      JSON.stringify(
        {
          agentCard: {
            name: "integration-weather-provider"
          },
          health,
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

void main();
