import type { AgentCard, PredictionHandlerResult, PredictionRequest } from "../src/index.js";

import {
  readString,
  requireObjectContext,
  startExampleServer
} from "./_shared.js";

export const sportsAgentCard: AgentCard = {
  protocolVersion: "0.1.0",
  name: "sports-proxy",
  description: "Example OPP provider that proxies ESPN standings and derives a simple matchup win probability.",
  url: "http://127.0.0.1:3003",
  identity: {
    id: "sports-proxy"
  },
  capabilities: {
    predictions: [
      {
        id: "sports.matchup.win-probability",
        domain: "sports.matchup",
        title: "Team win probability",
        description: "Returns a simple win probability based on ESPN standings win percentages.",
        output: {
          type: "binary-probability"
        },
        horizons: ["next-game"]
      }
    ]
  },
  pricing: {
    options: [
      {
        method: "free",
        model: "free"
      }
    ]
  },
  calibration: {
    domains: [
      {
        domain: "sports.matchup",
        scoreType: "brier",
        sampleSize: 0,
        verificationStatus: "provisional"
      }
    ]
  }
};

function toEspnLeague(league: string): string {
  const normalized = league.toLowerCase();
  if (normalized === "nba" || normalized === "nfl" || normalized === "mlb" || normalized === "nhl") {
    return normalized;
  }

  throw new Error(`Unsupported sports league: ${league}`);
}

function logistic(delta: number): number {
  return 1 / (1 + Math.exp(-delta * 6));
}

export async function sportsHandler(request: PredictionRequest): Promise<PredictionHandlerResult> {
  const context = requireObjectContext(request);
  const league = toEspnLeague(readString(context, "league"));
  const team = readString(context, "team").toLowerCase();
  const opponent = readString(context, "opponent").toLowerCase();

  const response = await fetch(`https://site.api.espn.com/apis/v2/sports/${league}/standings`);
  if (!response.ok) {
    throw new Error(`Sports upstream failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    standings?: Array<{
      entries?: Array<{
        team?: {
          displayName?: string;
          shortDisplayName?: string;
          abbreviation?: string;
        };
        stats?: Array<{
          name?: string;
          value?: number;
        }>;
      }>;
    }>;
  };

  const entries =
    payload.standings?.flatMap((standing) => standing.entries ?? []) ?? [];

  const lookup = new Map<string, number>();
  for (const entry of entries) {
    const winPct = entry.stats?.find((stat) => stat.name === "winPercent")?.value;
    if (typeof winPct !== "number") {
      continue;
    }

    const keys = [
      entry.team?.displayName,
      entry.team?.shortDisplayName,
      entry.team?.abbreviation
    ].filter((value): value is string => Boolean(value));

    for (const key of keys) {
      lookup.set(key.toLowerCase(), winPct);
    }
  }

  const teamWinPct = lookup.get(team);
  const opponentWinPct = lookup.get(opponent);

  if (teamWinPct === undefined || opponentWinPct === undefined) {
    throw new Error("Could not resolve team or opponent in ESPN standings");
  }

  const probability = logistic(teamWinPct - opponentWinPct);

  return {
    forecast: {
      type: "binary-probability",
      domain: "sports.matchup",
      horizon: request.prediction.horizon,
      generatedAt: new Date().toISOString(),
      probability,
      rationale: `ESPN standings win% heuristic: ${team} ${teamWinPct.toFixed(3)} vs ${opponent} ${opponentWinPct.toFixed(3)}`
    }
  };
}

async function main(): Promise<void> {
  const server = await startExampleServer(sportsAgentCard, sportsHandler, 3003);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
  console.log("sports-proxy listening on http://127.0.0.1:3003");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
