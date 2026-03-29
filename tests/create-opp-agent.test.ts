import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createOppAgentScaffold,
  generateOppAgentTemplate
} from "../packages/create-opp-agent/src/index.js";

describe("create-opp-agent", () => {
  it("generates the expected scaffold file set", () => {
    const files = generateOppAgentTemplate({
      packageName: "weather-agent",
      description: "Weather prediction agent",
      port: 4010
    });

    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
      "tsconfig.json"
    ]);
    expect(files["package.json"]).toContain("\"name\": \"weather-agent\"");
    expect(files["src/index.ts"]).toContain("const port = Number(process.env.PORT ?? 4010);");
    expect(files["src/index.ts"]).toContain("url: `http://${host}:${port}`");
  });

  it("writes the scaffold to disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "opp-agent-"));
    const targetDir = join(root, "weather-agent");

    await createOppAgentScaffold(targetDir, {
      packageName: "weather-agent",
      description: "Weather prediction agent",
      port: 4010
    });

    await expect(readFile(join(targetDir, "package.json"), "utf8")).resolves.toContain(
      "\"name\": \"weather-agent\""
    );
    await expect(readFile(join(targetDir, "src/index.ts"), "utf8")).resolves.toContain(
      "PredictionHttpServer"
    );
  });
});
