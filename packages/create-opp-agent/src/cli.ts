#!/usr/bin/env node

import { basename, resolve } from "node:path";

import { createOppAgentScaffold } from "./index.js";

async function main(): Promise<void> {
  const targetArg = process.argv[2];
  if (!targetArg) {
    throw new Error("Usage: create-opp-agent <target-dir> [description]");
  }

  const targetDir = resolve(targetArg);
  const packageName = basename(targetDir);
  const description = process.argv[3] ?? "OPP prediction agent";

  await createOppAgentScaffold(targetDir, {
    packageName,
    description
  });

  console.log(`Created OPP agent scaffold in ${targetDir}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Failed to create OPP agent scaffold";
  console.error(message);
  process.exitCode = 1;
});
