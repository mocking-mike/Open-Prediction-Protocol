import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3311);

const agentCard = {
  protocolVersion: "0.1.0",
  name: "independent-weather-provider",
  description: "Standalone OPP provider implemented without the reference SDK runtime.",
  url: `http://${host}:${port}`,
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
};

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function createCompletedResponse(requestId) {
  return {
    responseId: randomUUID(),
    requestId,
    status: "completed",
    createdAt: new Date().toISOString(),
    provider: {
      id: "independent-provider-1"
    },
    forecast: {
      type: "binary-probability",
      domain: "weather.precipitation",
      horizon: "24h",
      generatedAt: new Date().toISOString(),
      probability: 0.42,
      rationale: "Standalone provider deterministic forecast"
    }
  };
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 1_048_576) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sse(response, eventName, payload) {
  response.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/.well-known/agent.json") {
    json(response, 200, agentCard);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && request.url === "/rpc") {
    let payload;
    try {
      payload = await parseJsonBody(request);
    } catch {
      json(response, 400, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Invalid JSON"
        }
      });
      return;
    }

    if (payload?.jsonrpc !== "2.0" || typeof payload?.method !== "string") {
      json(response, 400, {
        jsonrpc: "2.0",
        id: payload?.id ?? null,
        error: {
          code: -32600,
          message: "Invalid JSON-RPC request"
        }
      });
      return;
    }

    if (payload.method === "predictions.request") {
      json(response, 200, {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        result: createCompletedResponse(payload.params?.requestId ?? "unknown-request")
      });
      return;
    }

    if (payload.method === "tasks/sendSubscribe") {
      response.statusCode = 200;
      response.setHeader("cache-control", "no-cache, no-transform");
      response.setHeader("connection", "keep-alive");
      response.setHeader("content-type", "text/event-stream; charset=utf-8");
      response.flushHeaders();

      const requestId = payload.params?.requestId ?? "unknown-request";
      sse(response, "lifecycle", {
        type: "lifecycle",
        requestId,
        createdAt: new Date().toISOString(),
        state: "submitted",
        provider: {
          id: "independent-provider-1"
        }
      });
      sse(response, "lifecycle", {
        type: "lifecycle",
        requestId,
        createdAt: new Date().toISOString(),
        state: "working",
        provider: {
          id: "independent-provider-1"
        }
      });
      sse(response, "result", {
        type: "result",
        response: createCompletedResponse(requestId)
      });
      response.end();
      return;
    }

    json(response, 404, {
      jsonrpc: "2.0",
      id: payload.id ?? null,
      error: {
        code: -32601,
        message: "Method not found"
      }
    });
    return;
  }

  json(response, 404, {
    error: {
      code: "not_found",
      message: "Route not found"
    }
  });
});

server.listen(port, host, () => {
  console.log(`Independent OPP provider listening on http://${host}:${port}`);
});
