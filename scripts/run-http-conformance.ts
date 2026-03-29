import { runHttpProviderConformance } from "../src/conformance/http.js";

async function main(): Promise<void> {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    throw new Error("Usage: pnpm run conformance:http -- <base-url>");
  }

  const report = await runHttpProviderConformance({ baseUrl });
  const failed = report.checks.filter((check) => !check.ok && check.severity === "error");
  const warnings = report.checks.filter((check) => !check.ok && check.severity === "warning");

  console.log(
    JSON.stringify(
      {
        baseUrl: report.baseUrl,
        passed: failed.length === 0,
        failures: failed,
        warnings,
        checks: report.checks
      },
      null,
      2
    )
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Conformance run failed";
  console.error(message);
  process.exitCode = 1;
});
