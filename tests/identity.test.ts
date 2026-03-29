import { describe, expect, it } from "vitest";

import { PredictionAgent } from "../src/agent/index.js";
import {
  createDidKeyIdentity,
  publicKeyFromDid,
  verifyPredictionResponseSignature
} from "../src/security/identity.js";

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
});
