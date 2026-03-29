import type { AgentCard, PredictionHandlerResult, PredictionRequest } from "../src/index.js";

import {
  readNumber,
  readString,
  requireObjectContext,
  startExampleServer
} from "./_shared.js";

export const cryptoAgentCard: AgentCard = {
  protocolVersion: "0.1.0",
  name: "crypto-proxy",
  description: "Example OPP provider that proxies CoinGecko market data with a simple momentum heuristic.",
  url: "http://127.0.0.1:3002",
  identity: {
    id: "crypto-proxy"
  },
  capabilities: {
    predictions: [
      {
        id: "finance.crypto.direction",
        domain: "finance.crypto",
        title: "Short-horizon crypto direction probability",
        description: "Returns a simple upward-move probability derived from 24h market change.",
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
        method: "free",
        model: "free"
      }
    ]
  },
  calibration: {
    domains: [
      {
        domain: "finance.crypto",
        scoreType: "brier",
        sampleSize: 0,
        verificationStatus: "provisional"
      }
    ]
  }
};

export async function cryptoHandler(request: PredictionRequest): Promise<PredictionHandlerResult> {
  const context = requireObjectContext(request);
  const coinId = readString(context, "coinId", "bitcoin");
  const vsCurrency = readString(context, "vsCurrency", "usd");
  const sensitivity = Math.max(0.01, readNumber(context, "sensitivity", 10));

  const apiUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
  apiUrl.searchParams.set("vs_currency", vsCurrency);
  apiUrl.searchParams.set("ids", coinId);
  apiUrl.searchParams.set("price_change_percentage", "24h");

  const response = await fetch(apiUrl, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Crypto upstream failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Array<{
    price_change_percentage_24h_in_currency?: number;
    current_price?: number;
    symbol?: string;
  }>;

  const coin = payload[0];
  if (!coin || typeof coin.price_change_percentage_24h_in_currency !== "number") {
    throw new Error("Crypto upstream did not return 24h change data");
  }

  const change = coin.price_change_percentage_24h_in_currency;
  const probability = 1 / (1 + Math.exp(-change / sensitivity));

  return {
    forecast: {
      type: "binary-probability",
      domain: "finance.crypto",
      horizon: request.prediction.horizon,
      generatedAt: new Date().toISOString(),
      probability,
      rationale: `CoinGecko 24h change ${change.toFixed(2)}% for ${(coin.symbol ?? coinId).toUpperCase()}`
    }
  };
}

async function main(): Promise<void> {
  const server = await startExampleServer(cryptoAgentCard, cryptoHandler, 3002);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
  console.log("crypto-proxy listening on http://127.0.0.1:3002");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
