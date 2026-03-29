import { afterEach, describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import { runHttpProviderConformance } from "../src/conformance/http.js";
import { PredictionHttpServer } from "../src/server/index.js";

describe("HTTP provider conformance", () => {
  let server: PredictionHttpServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("passes against the reference HTTP provider surface", async () => {
    server = new PredictionHttpServer({
      agentCard: {
        protocolVersion: "0.1.0",
        name: "weather-provider",
        url: "https://provider.example.com",
        capabilities: {
          predictions: [
            {
              id: "weather.precipitation.daily",
              domain: "weather.precipitation",
              title: "Daily precipitation probability",
              output: {
                type: "binary-probability"
              },
              horizons: ["24h"]
            }
          ]
        }
      },
      predictionAgent: new PredictionAgent({
        provider: {
          id: "provider-1"
        },
        handler: async () => ({
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.73
          }
        })
      })
    });

    let address: { host: string; port: number };
    try {
      address = await server.listen();
    } catch (error) {
      if (error instanceof Error && error.message.includes("EPERM")) {
        server = undefined;
        return;
      }
      throw error;
    }
    const report = await runHttpProviderConformance({
      baseUrl: `http://${address.host}:${address.port}`
    });

    expect(report.checks.filter((check) => !check.ok && check.severity === "error")).toEqual([]);
    expect(report.checks.some((check) => check.id === "stream.result" && check.ok)).toBe(true);
  });
});
