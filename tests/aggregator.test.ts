import { describe, expect, it } from "vitest";

import {
  PredictionAggregator,
  type AggregationProvider
} from "../src/client/aggregator.js";
import type { AgentCard, PredictionRequest, PredictionResponse } from "../src/types/index.js";

function createProvider(
  overrides: Partial<AgentCard>,
  response: PredictionResponse | Error
): AggregationProvider {
  const agentCard: AgentCard = {
    protocolVersion: "0.1.0",
    name: "provider",
    url: "https://provider.example.com",
    capabilities: {
      predictions: [
        {
          id: "weather-1",
          domain: "weather.precipitation",
          title: "Weather precipitation",
          output: {
            type: "binary-probability"
          },
          horizons: ["24h"]
        }
      ]
    },
    ...overrides
  };

  return {
    agentCard,
    transport: {
      async send() {
        if (response instanceof Error) {
          throw response;
        }

        return response;
      }
    }
  };
}

const request: PredictionRequest = {
  requestId: "agg-1",
  createdAt: "2026-03-28T12:00:00Z",
  consumer: {
    id: "consumer-1"
  },
  prediction: {
    domain: "weather.precipitation",
    question: "Will it rain?",
    horizon: "24h",
    desiredOutput: "binary-probability"
  }
};

describe("PredictionAggregator", () => {
  it("fans out to compatible providers and preserves failures", async () => {
    const aggregator = new PredictionAggregator();
    const results = await aggregator.fanOut(request, [
      createProvider(
        {
          name: "working-provider"
        },
        {
          responseId: "resp-1",
          requestId: "agg-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id: "provider-1"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.4
          }
        }
      ),
      createProvider(
        {
          name: "failing-provider"
        },
        new Error("provider unavailable")
      )
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.response?.status).toBe("completed");
    expect(results[1]!.error).toBe("provider unavailable");
  });

  it("rejects provider identity mismatches on the aggregation runtime path", async () => {
    const aggregator = new PredictionAggregator();
    const results = await aggregator.fanOut(request, [
      createProvider(
        {
          name: "trusted-provider",
          identity: {
            id: "trusted-provider"
          }
        },
        {
          responseId: "resp-1",
          requestId: "agg-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id: "unexpected-provider"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.4
          }
        }
      )
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.error).toContain("provider id does not match Agent Card identity");
  });

  it("aggregates binary forecasts with equal weighting by default", async () => {
    const aggregator = new PredictionAggregator();
    const result = await aggregator.aggregate(request, [
      createProvider(
        {
          name: "provider-a"
        },
        {
          responseId: "resp-1",
          requestId: "agg-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:00Z",
          provider: {
            id: "provider-a"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:00Z",
            probability: 0.25
          }
        }
      ),
      createProvider(
        {
          name: "provider-b"
        },
        {
          responseId: "resp-2",
          requestId: "agg-1",
          status: "completed",
          createdAt: "2026-03-28T12:01:05Z",
          provider: {
            id: "provider-b"
          },
          forecast: {
            type: "binary-probability",
            domain: "weather.precipitation",
            horizon: "24h",
            generatedAt: "2026-03-28T12:01:05Z",
            probability: 0.75
          }
        }
      )
    ]);

    expect(result.strategy).toBe("equal-weight");
    expect(result.forecast.type).toBe("binary-probability");
    if (result.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }
    expect(result.forecast.probability).toBeCloseTo(0.5);
    expect(result.contributors).toHaveLength(2);
  });

  it("uses calibration weighting when requested", async () => {
    const aggregator = new PredictionAggregator();
    const result = await aggregator.aggregate(
      request,
      [
        createProvider(
          {
            name: "strong-provider",
            calibration: {
              domains: [
                {
                  domain: "weather.precipitation",
                  scoreType: "brier",
                  score: 0.1,
                  sampleSize: 100,
                  verificationStatus: "verified"
                }
              ]
            }
          },
          {
            responseId: "resp-1",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:00Z",
            provider: {
              id: "strong-provider"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.8
            }
          }
        ),
        createProvider(
          {
            name: "weak-provider",
            calibration: {
              domains: [
                {
                  domain: "weather.precipitation",
                  scoreType: "brier",
                  score: 0.4,
                  sampleSize: 10,
                  verificationStatus: "self-reported"
                }
              ]
            }
          },
          {
            responseId: "resp-2",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:05Z",
            provider: {
              id: "weak-provider"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:05Z",
              probability: 0.2
            }
          }
        )
      ],
      {
        strategy: "calibration-weighted"
      }
    );

    expect(result.forecast.type).toBe("binary-probability");
    if (result.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }
    expect(result.forecast.probability).toBeGreaterThan(0.5);
    expect(result.contributors[0]?.providerName).toBe("strong-provider");
  });

  it("weights binary confidence using the same provider weights", async () => {
    const aggregator = new PredictionAggregator();
    const result = await aggregator.aggregate(
      request,
      [
        createProvider(
          {
            name: "high-weight",
            calibration: {
              domains: [
                {
                  domain: "weather.precipitation",
                  scoreType: "brier",
                  score: 0.1,
                  sampleSize: 100,
                  verificationStatus: "verified"
                }
              ]
            }
          },
          {
            responseId: "resp-1",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:00Z",
            provider: {
              id: "high-weight"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.7,
              confidence: 0.9
            }
          }
        ),
        createProvider(
          {
            name: "low-weight",
            calibration: {
              domains: [
                {
                  domain: "weather.precipitation",
                  scoreType: "brier",
                  score: 0.4,
                  sampleSize: 10,
                  verificationStatus: "self-reported"
                }
              ]
            }
          },
          {
            responseId: "resp-2",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:05Z",
            provider: {
              id: "low-weight"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:05Z",
              probability: 0.3,
              confidence: 0.1
            }
          }
        )
      ],
      {
        strategy: "calibration-weighted"
      }
    );

    expect(result.forecast.type).toBe("binary-probability");
    if (result.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }
    expect(result.forecast.confidence).toBeDefined();
    expect(result.forecast.confidence!).toBeGreaterThan(0.5);
  });

  it("dilutes aggregate confidence when some providers omit confidence", async () => {
    const aggregator = new PredictionAggregator();
    const result = await aggregator.aggregate(
      request,
      [
        createProvider(
          {
            name: "provider-with-confidence"
          },
          {
            responseId: "resp-1",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:00Z",
            provider: {
              id: "provider-with-confidence"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.6,
              confidence: 0.8
            }
          }
        ),
        createProvider(
          {
            name: "provider-without-confidence"
          },
          {
            responseId: "resp-2",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:05Z",
            provider: {
              id: "provider-without-confidence"
            },
            forecast: {
              type: "binary-probability",
              domain: "weather.precipitation",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:05Z",
              probability: 0.4
            }
          }
        )
      ]
    );

    expect(result.forecast.type).toBe("binary-probability");
    if (result.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }
    expect(result.forecast.confidence).toBe(0.4);
  });

  it("rejects numeric aggregation when provider units differ", async () => {
    const numericRequest: PredictionRequest = {
      ...request,
      prediction: {
        ...request.prediction,
        domain: "weather.temperature",
        desiredOutput: "numeric-range"
      }
    };

    await expect(
      new PredictionAggregator().aggregate(numericRequest, [
        {
          agentCard: {
            protocolVersion: "0.1.0",
            name: "celsius-provider",
            url: "https://celsius.example.com",
            capabilities: {
              predictions: [
                {
                  id: "temp-c",
                  domain: "weather.temperature",
                  title: "Temperature",
                  output: {
                    type: "numeric-range",
                    units: "C"
                  },
                  horizons: ["24h"]
                }
              ]
            }
          },
          transport: {
            async send() {
              return {
                responseId: "resp-c",
                requestId: "agg-1",
                status: "completed",
                createdAt: "2026-03-28T12:01:00Z",
                provider: {
                  id: "celsius-provider"
                },
                forecast: {
                  type: "numeric-range",
                  domain: "weather.temperature",
                  horizon: "24h",
                  generatedAt: "2026-03-28T12:01:00Z",
                  range: {
                    min: 10,
                    max: 15,
                    units: "C"
                  }
                }
              };
            }
          }
        },
        {
          agentCard: {
            protocolVersion: "0.1.0",
            name: "fahrenheit-provider",
            url: "https://fahrenheit.example.com",
            capabilities: {
              predictions: [
                {
                  id: "temp-f",
                  domain: "weather.temperature",
                  title: "Temperature",
                  output: {
                    type: "numeric-range",
                    units: "F"
                  },
                  horizons: ["24h"]
                }
              ]
            }
          },
          transport: {
            async send() {
              return {
                responseId: "resp-f",
                requestId: "agg-1",
                status: "completed",
                createdAt: "2026-03-28T12:01:05Z",
                provider: {
                  id: "fahrenheit-provider"
                },
                forecast: {
                  type: "numeric-range",
                  domain: "weather.temperature",
                  horizon: "24h",
                  generatedAt: "2026-03-28T12:01:05Z",
                  range: {
                    min: 50,
                    max: 59,
                    units: "F"
                  }
                }
              };
            }
          }
        }
      ])
    ).rejects.toThrow("different units");
  });

  it("rejects aggregation when no providers match the request", async () => {
    const aggregator = new PredictionAggregator();

    await expect(
      aggregator.aggregate(request, [
        createProvider(
          {
            capabilities: {
              predictions: [
                {
                  id: "sports-1",
                  domain: "sports.outcome",
                  title: "Sports outcome",
                  output: {
                    type: "binary-probability"
                  },
                  horizons: ["24h"]
                }
              ]
            }
          },
          {
            responseId: "resp-1",
            requestId: "agg-1",
            status: "completed",
            createdAt: "2026-03-28T12:01:00Z",
            provider: {
              id: "provider-1"
            },
            forecast: {
              type: "binary-probability",
              domain: "sports.outcome",
              horizon: "24h",
              generatedAt: "2026-03-28T12:01:00Z",
              probability: 0.4
            }
          }
        )
      ])
    ).rejects.toThrow("No compatible providers available");
  });
});
