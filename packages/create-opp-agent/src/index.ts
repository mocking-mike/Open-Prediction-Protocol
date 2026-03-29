import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface CreateOppAgentOptions {
  packageName: string;
  description?: string;
  port?: number;
}

export function generateOppAgentTemplate(
  options: CreateOppAgentOptions
): Record<string, string> {
  const packageName = options.packageName.trim();
  if (!packageName) {
    throw new Error("packageName is required");
  }

  const description = options.description?.trim() || "OPP prediction agent";
  const port = options.port ?? 3001;

  return {
    "package.json": createPackageJson(packageName, description),
    "tsconfig.json": createTsconfigJson(),
    "src/index.ts": createSourceIndex(packageName, description, port),
    "README.md": createReadme(packageName, description, port)
  };
}

export async function createOppAgentScaffold(
  targetDir: string,
  options: CreateOppAgentOptions
): Promise<void> {
  const files = generateOppAgentTemplate(options);
  const root = resolve(targetDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = resolve(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
}

function createPackageJson(packageName: string, description: string): string {
  return `${JSON.stringify(
    {
      name: packageName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "tsx src/index.ts"
      },
      dependencies: {
        "open-prediction-protocol": "^0.1.0"
      },
      devDependencies: {
        tsx: "^4.21.0",
        typescript: "^6.0.2"
      },
      description
    },
    null,
    2
  )}\n`;
}

function createTsconfigJson(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        module: "nodenext",
        target: "es2023",
        strict: true,
        esModuleInterop: true,
        moduleDetection: "force"
      },
      include: ["src/**/*.ts"]
    },
    null,
    2
  )}\n`;
}

function createSourceIndex(packageName: string, description: string, port: number): string {
  return `import { PredictionAgent, PredictionHttpServer } from "open-prediction-protocol";

const port = Number(process.env.PORT ?? ${port});
const host = "127.0.0.1";

const predictionAgent = new PredictionAgent({
  provider: {
    id: "${packageName}"
  },
  handler: async (request) => ({
    forecast: {
      type: "binary-probability",
      domain: request.prediction.domain,
      horizon: request.prediction.horizon,
      generatedAt: new Date().toISOString(),
      probability: 0.5,
      rationale: "${description}"
    }
  })
});

const server = new PredictionHttpServer({
  agentCard: {
    protocolVersion: "0.1.0",
    name: "${packageName}",
    description: "${description}",
    url: \`http://\${host}:\${port}\`,
    capabilities: {
      predictions: [
        {
          id: "${packageName}.default",
          domain: "weather.precipitation",
          title: "Default binary prediction capability",
          output: {
            type: "binary-probability"
          },
          horizons: ["24h"]
        }
      ]
    }
  },
  predictionAgent
});

server.listen(port, host).then(({ port: boundPort }) => {
  console.log(\`OPP agent listening on http://\${host}:\${boundPort}\`);
});
`;
}

function createReadme(packageName: string, description: string, port: number): string {
  return `# ${packageName}

${description}

## Run

\`\`\`bash
pnpm install
pnpm run dev
\`\`\`

The scaffold starts an OPP HTTP provider on port \`${port}\` by default.
`;
}
