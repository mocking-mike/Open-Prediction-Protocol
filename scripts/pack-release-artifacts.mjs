import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";

async function run(command, args, cwd) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const releaseDir = resolve(repoRoot, ".release");

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });

  await run("pnpm", ["pack", "--pack-destination", releaseDir], repoRoot);
  await run(
    "pnpm",
    ["--dir", "packages/create-opp-agent", "pack", "--pack-destination", releaseDir],
    repoRoot
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Release packing failed";
  console.error(message);
  process.exitCode = 1;
});
