import { describe, expect, it } from "vitest";

import {
  resolveBinaryOutcomeConsensus,
  summarizeConsensusAgreement
} from "../src/scoring/consensus.js";

describe("scoring consensus", () => {
  it("resolves consensus with simple majority voting", () => {
    const result = resolveBinaryOutcomeConsensus({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      submissions: [
        {
          scorer: {
            id: "scorer-1"
          },
          outcome: true
        },
        {
          scorer: {
            id: "scorer-2"
          },
          outcome: true
        },
        {
          scorer: {
            id: "scorer-3"
          },
          outcome: false
        }
      ]
    });

    expect(result).toEqual({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      strategy: "majority",
      agreedOutcome: true,
      agreementRatio: 2 / 3,
      participation: 3,
      dissentingScorers: ["scorer-3"]
    });
  });

  it("supports weighted consensus when scorer weights are supplied", () => {
    const result = resolveBinaryOutcomeConsensus({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      strategy: "weighted",
      submissions: [
        {
          scorer: {
            id: "scorer-1"
          },
          outcome: true,
          weight: 0.2
        },
        {
          scorer: {
            id: "scorer-2"
          },
          outcome: false,
          weight: 0.7
        },
        {
          scorer: {
            id: "scorer-3"
          },
          outcome: true,
          weight: 0.1
        }
      ]
    });

    expect(result).toEqual({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      strategy: "weighted",
      agreedOutcome: false,
      agreementRatio: 0.7,
      participation: 3,
      dissentingScorers: ["scorer-1", "scorer-3"]
    });
  });

  it("rejects consensus if submissions reference multiple domains or response ids", () => {
    expect(() =>
      resolveBinaryOutcomeConsensus({
        responseId: "resp-1",
        requestId: "req-1",
        domain: "weather.precipitation",
        submissions: [
          {
            scorer: {
              id: "scorer-1"
            },
            outcome: true,
            responseId: "resp-1",
            domain: "weather.precipitation"
          },
          {
            scorer: {
              id: "scorer-2"
            },
            outcome: false,
            responseId: "resp-2",
            domain: "weather.temperature"
          }
        ]
      })
    ).toThrow("Consensus submissions must target the same responseId and domain");
  });

  it("rejects tied consensus results", () => {
    expect(() =>
      resolveBinaryOutcomeConsensus({
        responseId: "resp-1",
        requestId: "req-1",
        domain: "weather.precipitation",
        submissions: [
          {
            scorer: {
              id: "scorer-1"
            },
            outcome: true
          },
          {
            scorer: {
              id: "scorer-2"
            },
            outcome: false
          }
        ]
      })
    ).toThrow("Consensus could not resolve a single binary outcome");
  });

  it("summarizes scorer agreement statistics", () => {
    const summary = summarizeConsensusAgreement({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      strategy: "majority",
      agreedOutcome: true,
      agreementRatio: 0.75,
      participation: 4,
      dissentingScorers: ["scorer-4"]
    });

    expect(summary).toEqual({
      responseId: "resp-1",
      requestId: "req-1",
      domain: "weather.precipitation",
      agreedOutcome: true,
      agreementPercentage: 75,
      participation: 4,
      dissentCount: 1
    });
  });
});
