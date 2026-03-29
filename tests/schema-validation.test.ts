import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { describe, expect, it } from "vitest";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type ValidatorFn = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
type AjvLike = {
  addFormat: (name: string, validator: { validate: (value: string) => boolean }) => AjvLike;
  compile: (schema: object) => ValidatorFn;
};
type AjvCtor = new (options: Record<string, unknown>) => AjvLike;

async function loadSchema(name: string): Promise<object> {
  const schemaUrl = new URL(`../spec/${name}`, import.meta.url);
  const contents = await readFile(fileURLToPath(schemaUrl), "utf8");
  return JSON.parse(contents) as object;
}

async function validateSchema(name: string, data: JsonValue): Promise<{ valid: boolean; errors: string[] }> {
  const Ajv2020Ctor = Ajv2020 as unknown as AjvCtor;
  const ajv = new Ajv2020Ctor({
    allErrors: true,
    strict: false,
    validateFormats: true
  });

  ajv.addFormat("date-time", {
    validate: (value: string) => {
      if (typeof value !== "string") {
        return false;
      }

      const dateTimePattern =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
      if (!dateTimePattern.test(value)) {
        return false;
      }

      return !Number.isNaN(Date.parse(value));
    }
  });

  ajv.addFormat("uri", {
    validate: (value: string) => {
      if (typeof value !== "string") {
        return false;
      }

      try {
        const parsed = new URL(value);
        return parsed.protocol.length > 0 && parsed.host.length > 0;
      } catch {
        return false;
      }
    }
  });

  const schema = await loadSchema(name);
  const validate = ajv.compile(schema);
  const valid = validate(data);

  return {
    valid: Boolean(valid),
    errors: (validate.errors ?? []).map(
      (error: ErrorObject) => `${error.instancePath} ${error.message ?? "validation error"}`
    )
  };
}

describe("agent-card schema", () => {
  it("accepts a minimal valid provider card", async () => {
    const result = await validateSchema("agent-card.schema.json", {
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
            horizons: ["24h", "72h"]
          }
        ]
      }
    });

    expect(result.valid, result.errors.join("\n")).toBe(true);
  });

  it("rejects a card without prediction capabilities", async () => {
    const result = await validateSchema("agent-card.schema.json", {
      protocolVersion: "0.1.0",
      name: "broken-provider",
      url: "https://provider.example.com",
      capabilities: {
        predictions: []
      }
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a card with an invalid URL", async () => {
    const result = await validateSchema("agent-card.schema.json", {
      protocolVersion: "0.1.0",
      name: "broken-provider",
      url: "not-a-uri",
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
    });

    expect(result.valid).toBe(false);
  });
});

describe("prediction-request schema", () => {
  it("accepts a valid request", async () => {
    const result = await validateSchema("prediction-request.schema.json", {
      requestId: "req-123",
      createdAt: "2026-03-28T12:00:00Z",
      consumer: {
        id: "consumer-1"
      },
      prediction: {
        domain: "weather.precipitation",
        question: "Will precipitation exceed 10mm in Warsaw tomorrow?",
        horizon: "24h",
        desiredOutput: "binary-probability"
      },
      constraints: {
        maxLatencyMs: 5000,
        minVerificationStatus: "provisional"
      }
    });

    expect(result.valid, result.errors.join("\n")).toBe(true);
  });

  it("rejects a request with an invalid prediction domain", async () => {
    const result = await validateSchema("prediction-request.schema.json", {
      requestId: "req-123",
      createdAt: "2026-03-28T12:00:00Z",
      consumer: {
        id: "consumer-1"
      },
      prediction: {
        domain: "weather",
        question: "Will it rain?",
        horizon: "24h",
        desiredOutput: "binary-probability"
      }
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a request with an invalid timestamp", async () => {
    const result = await validateSchema("prediction-request.schema.json", {
      requestId: "req-123",
      createdAt: "not-a-date",
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

    expect(result.valid).toBe(false);
  });
});

describe("prediction-response schema", () => {
  it("accepts a completed binary forecast response", async () => {
    const result = await validateSchema("prediction-response.schema.json", {
      responseId: "resp-123",
      requestId: "req-123",
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
        probability: 0.64
      },
      freshness: {
        timestamp: "2026-03-28T12:01:00Z",
        nonce: "abc123"
      }
    });

    expect(result.valid, result.errors.join("\n")).toBe(true);
  });

  it("rejects a failed response without an error object", async () => {
    const result = await validateSchema("prediction-response.schema.json", {
      responseId: "resp-123",
      requestId: "req-123",
      status: "failed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      }
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a completed response that also contains an error", async () => {
    const result = await validateSchema("prediction-response.schema.json", {
      responseId: "resp-123",
      requestId: "req-123",
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
        probability: 0.64
      },
      error: {
        code: "unexpected",
        message: "should not exist"
      }
    });

    expect(result.valid).toBe(false);
  });

  it("accepts a failed response without a forecast", async () => {
    const result = await validateSchema("prediction-response.schema.json", {
      responseId: "resp-123",
      requestId: "req-123",
      status: "failed",
      createdAt: "2026-03-28T12:01:00Z",
      provider: {
        id: "provider-1"
      },
      error: {
        code: "prediction_failed",
        message: "upstream unavailable"
      }
    });

    expect(result.valid, result.errors.join("\n")).toBe(true);
  });
});
