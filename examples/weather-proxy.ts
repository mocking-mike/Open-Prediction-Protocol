import type { AgentCard, PredictionHandlerResult, PredictionRequest } from "../src/index.js";

import {
  readNumber,
  requireObjectContext,
  startExampleServer
} from "./_shared.js";

export const weatherAgentCard: AgentCard = {
  protocolVersion: "0.1.0",
  name: "weather-proxy",
  description: "Example OPP provider that proxies Open-Meteo weather data.",
  url: "http://127.0.0.1:3001",
  identity: {
    id: "weather-proxy"
  },
  capabilities: {
    predictions: [
      {
        id: "weather.precipitation.daily",
        domain: "weather.precipitation",
        title: "Daily precipitation probability",
        description: "Returns precipitation probability from Open-Meteo for a location and day offset.",
        output: {
          type: "binary-probability"
        },
        horizons: ["24h", "48h", "72h"]
      }
    ]
  },
  pricing: {
    options: [
      {
        method: "free",
        model: "free"
      }
    ]
  },
  calibration: {
    domains: [
      {
        domain: "weather.precipitation",
        scoreType: "brier",
        sampleSize: 0,
        verificationStatus: "provisional"
      }
    ]
  }
};

export async function weatherHandler(request: PredictionRequest): Promise<PredictionHandlerResult> {
  const context = requireObjectContext(request);
  const latitude = readNumber(context, "latitude");
  const longitude = readNumber(context, "longitude");
  const dayOffset = Math.max(0, Math.floor(readNumber(context, "dayOffset", 0)));

  const apiUrl = new URL("https://api.open-meteo.com/v1/forecast");
  apiUrl.searchParams.set("latitude", String(latitude));
  apiUrl.searchParams.set("longitude", String(longitude));
  apiUrl.searchParams.set("daily", "precipitation_probability_max");
  apiUrl.searchParams.set("forecast_days", String(Math.max(dayOffset + 1, 1)));
  apiUrl.searchParams.set("timezone", "UTC");

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Weather upstream failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    daily?: {
      precipitation_probability_max?: number[];
      time?: string[];
    };
  };

  const probabilityPercent = payload.daily?.precipitation_probability_max?.[dayOffset];
  const forecastDate = payload.daily?.time?.[dayOffset];

  if (typeof probabilityPercent !== "number") {
    throw new Error("Weather upstream did not return precipitation probability");
  }

  return {
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: request.prediction.horizon,
      generatedAt: new Date().toISOString(),
      probability: Math.max(0, Math.min(1, probabilityPercent / 100)),
      rationale: forecastDate
        ? `Open-Meteo precipitation probability for ${forecastDate}`
        : "Open-Meteo precipitation probability"
    }
  };
}

async function main(): Promise<void> {
  const server = await startExampleServer(weatherAgentCard, weatherHandler, 3001);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
  console.log("weather-proxy listening on http://127.0.0.1:3001");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
