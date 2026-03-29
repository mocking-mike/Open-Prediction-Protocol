import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import {
  createDidKeyIdentity,
  createSignaturePayload,
  publicKeyFromDid,
  verifyPredictionResponseSignature
} from "../src/security/identity.js";
import type { PredictionResponse } from "../src/types/index.js";

describe("identity and signatures", () => {
  it("creates a did:key identity and derives a public key from it", () => {
    const identity = createDidKeyIdentity();

    expect(identity.did.startsWith("did:key:z")).toBe(true);
    expect(identity.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(identity.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(() => publicKeyFromDid(identity.did)).not.toThrow();
  });

  it("signs completed responses and verifies the signature", async () => {
    const identity = createDidKeyIdentity();
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      identity,
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.68
        }
      })
    });

    const response = await agent.handleRequest({
      requestId: "req-identity-1",
      createdAt: "2026-03-28T12:00:00Z",
      consumer: {
        id: "consumer-1",
        did: "did:key:z6MkhfakeRecipientDid"
      },
      prediction: {
        domain: "weather.precipitation",
        question: "Will it rain?",
        horizon: "24h",
        desiredOutput: "binary-probability"
      }
    });

    expect(response.status).toBe("completed");
    if (response.status !== "completed") {
      throw new Error("Expected completed response");
    }
    expect(response.provider.did).toBe(identity.did);
    expect(response.signature?.alg).toBe("Ed25519");
    expect(response.freshness?.recipientDid).toBe("did:key:z6MkhfakeRecipientDid");
    expect(typeof response.freshness?.nonce).toBe("string");
    expect(typeof response.freshness?.timestamp).toBe("string");
    expect(verifyPredictionResponseSignature(response)).toBe(true);
  });

  it("fails verification if a signed response is tampered with", async () => {
    const identity = createDidKeyIdentity();
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      identity,
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.68
        }
      })
    });

    const response = await agent.handleRequest({
      requestId: "req-identity-2",
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
    });

    if (response.status !== "completed") {
      throw new Error("Expected completed response");
    }
    if (response.forecast.type !== "binary-probability") {
      throw new Error("Expected binary forecast");
    }

    response.forecast.probability = 0.12;
    expect(verifyPredictionResponseSignature(response)).toBe(false);
  });

  it("produces the same signature payload regardless of object property order", () => {
    const firstResponse = {
      responseId: "resp-1",
      requestId: "req-1",
      status: "completed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1",
        did: "did:key:z6Mkprovider"
      },
      forecast: {
        type: "binary-probability",
        domain: "weather.precipitation",
        horizon: "24h",
        generatedAt: "2026-03-28T12:01:00Z",
        probability: 0.68,
        rationale: "Stable models"
      },
      freshness: {
        timestamp: "2026-03-28T12:01:00Z",
        nonce: "nonce-1",
        recipientDid: "did:key:z6Mkconsumer"
      }
    } as const;

    const secondResponse = {
      createdAt: "2026-03-28T12:01:00Z",
      status: "completed",
      requestId: "req-1",
      responseId: "resp-1",
      forecast: {
        rationale: "Stable models",
        probability: 0.68,
        generatedAt: "2026-03-28T12:01:00Z",
        horizon: "24h",
        domain: "weather.precipitation",
        type: "binary-probability"
      },
      provider: {
        did: "did:key:z6Mkprovider",
        id: "provider-1"
      },
      freshness: {
        recipientDid: "did:key:z6Mkconsumer",
        nonce: "nonce-1",
        timestamp: "2026-03-28T12:01:00Z"
      }
    } as const;

    expect(createSignaturePayload(firstResponse)).toBe(createSignaturePayload(secondResponse));
  });

  it("verifies a signed response even when object keys are reordered", async () => {
    const identity = createDidKeyIdentity();
    const agent = new PredictionAgent({
      provider: {
        id: "provider-1"
      },
      identity,
      handler: async () => ({
        forecast: {
          type: "binary-probability",
          domain: "weather.precipitation",
          horizon: "24h",
          generatedAt: "2026-03-28T12:01:00Z",
          probability: 0.68,
          rationale: "Stable models"
        },
        freshness: {
          nonce: "nonce-1",
          timestamp: "2026-03-28T12:01:00Z",
          recipientDid: "did:key:z6Mkconsumer"
        }
      })
    });

    const response = await agent.handleRequest({
      requestId: "req-identity-3",
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
    });

    expect(response.status).toBe("completed");
    if (response.status !== "completed") {
      throw new Error("Expected completed response");
    }

    const reorderedResponse = {
      createdAt: response.createdAt,
      requestId: response.requestId,
      responseId: response.responseId,
      status: response.status,
      provider: {
        ...(response.provider.did ? { did: response.provider.did } : {}),
        id: response.provider.id
      },
      ...(response.freshness
        ? {
            freshness: {
              ...(response.freshness.recipientDid
                ? { recipientDid: response.freshness.recipientDid }
                : {}),
              ...(response.freshness.nonce ? { nonce: response.freshness.nonce } : {}),
              ...(response.freshness.timestamp
                ? { timestamp: response.freshness.timestamp }
                : {})
            }
          }
        : {}),
      forecast: response.forecast.type === "binary-probability"
        ? {
            ...(response.forecast.rationale
              ? { rationale: response.forecast.rationale }
              : {}),
            probability: response.forecast.probability,
            generatedAt: response.forecast.generatedAt,
            horizon: response.forecast.horizon,
            domain: response.forecast.domain,
            type: response.forecast.type
          }
        : response.forecast,
      ...(response.signature ? { signature: response.signature } : {})
    };

    expect(verifyPredictionResponseSignature(reorderedResponse)).toBe(true);
  });

  it("canonicalizes undefined array entries as null", () => {
    const response = {
      responseId: "resp-array-1",
      requestId: "req-array-1",
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
        probability: 0.68
      },
      audit: {
        sequence: [1, undefined, 2]
      }
    } satisfies PredictionResponse;

    expect(createSignaturePayload(response)).toContain("\"sequence\":[1,null,2]");
  });
});
