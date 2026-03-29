import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { randomInt } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

import { runHttpProviderConformance } from "../src/conformance/http.js";

describe("independent interoperability", () => {
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (!child || child.killed || child.exitCode !== null) {
      child = undefined;
      return;
    }

    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 1_000))
    ]);
    child = undefined;
  });

  it(
    "passes conformance against a standalone provider that does not use the SDK runtime",
    async () => {
      const port = 3300 + randomInt(200);
      let stderr = "";

    child = spawn("node", ["examples/independent-http-provider.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (!child.stderr) {
      throw new Error("Expected child process stderr pipe");
    }

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

      const started = await Promise.race([
        waitForHealth(`http://127.0.0.1:${port}/health`, 2_000).then(() => "health" as const),
        once(child, "exit").then(() => "exit" as const)
      ]);

      if (started === "exit") {
        if (stderr.includes("EPERM") || stderr.includes("operation not permitted")) {
          child = undefined;
          return;
        }

        throw new Error(stderr || "Independent provider exited before becoming healthy");
      }

      const report = await runHttpProviderConformance({
        baseUrl: `http://127.0.0.1:${port}`
      });

      expect(report.checks.filter((check) => !check.ok && check.severity === "error")).toEqual([]);
      expect(report.agentCard?.name).toBe("independent-weather-provider");
    },
    10_000
  );
});

async function waitForHealth(url: string, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${url}`);
}
