import {
  PredictionAggregator,
  PredictionClient,
  HttpPredictionTransport
} from "../src/index.js";

import { startExampleServer } from "./_shared.js";
import { weatherAgentCard } from "./weather-proxy.js";

async function main(): Promise<void> {
  const firstServer = await startExampleServer(
    {
      ...weatherAgentCard,
      name: "aggregation-weather-a",
      url: "http://127.0.0.1:3011"
    },
    async (request) => ({
      forecast: {
        type: "binary-probability",
        domain: request.prediction.domain,
        horizon: request.prediction.horizon,
        generatedAt: new Date().toISOString(),
        probability: 0.3,
        confidence: 0.7,
        rationale: "Deterministic provider A"
      }
    }),
    3011
  );

  const secondServer = await startExampleServer(
    {
      ...weatherAgentCard,
      name: "aggregation-weather-b",
      url: "http://127.0.0.1:3012",
      calibration: {
        domains: [
          {
            domain: "weather.precipitation",
            scoreType: "brier",
            score: 0.12,
            sampleSize: 120,
            verificationStatus: "verified"
          }
        ]
      }
    },
    async (request) => ({
      forecast: {
        type: "binary-probability",
        domain: request.prediction.domain,
        horizon: request.prediction.horizon,
        generatedAt: new Date().toISOString(),
        probability: 0.8,
        confidence: 0.9,
        rationale: "Deterministic provider B"
      }
    }),
    3012
  );

  try {
    const client = new PredictionClient();
    const aggregator = new PredictionAggregator(client);
    const result = await aggregator.aggregate(
      {
        requestId: "aggregation-demo-1",
        createdAt: new Date().toISOString(),
        consumer: {
          id: "aggregation-demo-client"
        },
        prediction: {
          domain: "weather.precipitation",
          question: "Will it rain in Warsaw tomorrow?",
          horizon: "24h",
          desiredOutput: "binary-probability",
          context: {
            latitude: 52.2297,
            longitude: 21.0122,
            dayOffset: 1
          }
        }
      },
      [
        {
          agentCard: {
            ...weatherAgentCard,
            name: "aggregation-weather-a",
            url: "http://127.0.0.1:3011"
          },
          transport: new HttpPredictionTransport({
            baseUrl: "http://127.0.0.1:3011"
          })
        },
        {
          agentCard: {
            ...weatherAgentCard,
            name: "aggregation-weather-b",
            url: "http://127.0.0.1:3012",
            calibration: {
              domains: [
                {
                  domain: "weather.precipitation",
                  scoreType: "brier",
                  score: 0.12,
                  sampleSize: 120,
                  verificationStatus: "verified"
                }
              ]
            }
          },
          transport: new HttpPredictionTransport({
            baseUrl: "http://127.0.0.1:3012"
          })
        }
      ],
      {
        strategy: "calibration-weighted"
      }
    );

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await Promise.all([firstServer.close(), secondServer.close()]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
