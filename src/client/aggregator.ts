import type {
  AgentCard,
  BinaryForecast,
  CategoricalForecast,
  Forecast,
  NumericRangeForecast,
  PredictionRequest,
  PredictionResponse
} from "../types/index.js";
import { PredictionClient, type PredictionTransport } from "./index.js";

export interface AggregationProvider {
  agentCard: AgentCard;
  transport: PredictionTransport;
}

export interface ProviderPredictionResult {
  agentCard: AgentCard;
  response?: PredictionResponse;
  error?: string;
}

export type AggregationStrategy = "equal-weight" | "calibration-weighted";

export interface AggregationOptions {
  strategy?: AggregationStrategy;
}

export interface AggregatedPrediction {
  requestId: string;
  strategy: AggregationStrategy;
  forecast: Forecast;
  contributors: Array<{
    providerId: string;
    providerName: string;
    weight: number;
    responseId: string;
  }>;
  results: ProviderPredictionResult[];
}

type CompletedPredictionResponse = Extract<PredictionResponse, { status: "completed" }>;

interface WeightedForecast {
  weight: number;
  agentCard: AgentCard;
  response: CompletedPredictionResponse;
}

type BinaryWeightedForecast = Omit<WeightedForecast, "response"> & {
  response: CompletedPredictionResponse & { forecast: BinaryForecast };
};

type CategoricalWeightedForecast = Omit<WeightedForecast, "response"> & {
  response: CompletedPredictionResponse & { forecast: CategoricalForecast };
};

type NumericRangeWeightedForecast = Omit<WeightedForecast, "response"> & {
  response: CompletedPredictionResponse & { forecast: NumericRangeForecast };
};

export class PredictionAggregator {
  private readonly client: PredictionClient;

  constructor(client = new PredictionClient()) {
    this.client = client;
  }

  async fanOut(
    request: PredictionRequest,
    providers: AggregationProvider[]
  ): Promise<ProviderPredictionResult[]> {
    this.client.validateRequest(request);

    const compatibleProviders = providers.filter((provider) =>
      supportsRequest(provider.agentCard, request)
    );

    if (compatibleProviders.length === 0) {
      throw new Error("No compatible providers available for prediction request");
    }

    return Promise.all(
      compatibleProviders.map(async (provider) => {
        this.client.validateAgentCard(provider.agentCard);

        try {
          const response = await this.client.request(request, provider.transport);
          return {
            agentCard: provider.agentCard,
            response
          };
        } catch (error) {
          return {
            agentCard: provider.agentCard,
            error: error instanceof Error ? error.message : "Unknown prediction error"
          };
        }
      })
    );
  }

  async aggregate(
    request: PredictionRequest,
    providers: AggregationProvider[],
    options: AggregationOptions = {}
  ): Promise<AggregatedPrediction> {
    const strategy = options.strategy ?? "equal-weight";
    const results = await this.fanOut(request, providers);
    const weightedForecasts = results
      .filter(
        (result): result is ProviderPredictionResult & {
          response: Extract<PredictionResponse, { status: "completed" }>;
        } => result.response?.status === "completed"
      )
      .map((result) => ({
        weight: selectWeight(result.agentCard, request.prediction.domain, strategy),
        agentCard: result.agentCard,
        response: result.response
      }))
      .filter((entry) => entry.weight > 0);

    if (weightedForecasts.length === 0) {
      throw new Error("No completed predictions available for aggregation");
    }

    const forecast = mergeForecasts(weightedForecasts);
    const contributors = weightedForecasts.map((entry) => ({
      providerId: entry.response.provider.id,
      providerName: entry.agentCard.name,
      weight: entry.weight,
      responseId: entry.response.responseId
    }));

    return {
      requestId: request.requestId,
      strategy,
      forecast,
      contributors,
      results
    };
  }
}

function supportsRequest(agentCard: AgentCard, request: PredictionRequest): boolean {
  return agentCard.capabilities.predictions.some(
    (capability) =>
      capability.domain === request.prediction.domain &&
      capability.output.type === request.prediction.desiredOutput &&
      capability.horizons.includes(request.prediction.horizon)
  );
}

function selectWeight(
  agentCard: AgentCard,
  domain: string,
  strategy: AggregationStrategy
): number {
  if (strategy !== "calibration-weighted") {
    return 1;
  }

  const calibration = agentCard.calibration?.domains.find((entry) => entry.domain === domain);
  if (!calibration || calibration.score == null) {
    return 1;
  }

  const sampleFactor = Math.max(1, Math.log10(calibration.sampleSize + 10));

  if (calibration.scoreType === "brier") {
    return Math.max(0.01, 1 - calibration.score) * sampleFactor;
  }

  return Math.max(0.01, 1 / (1 + calibration.score)) * sampleFactor;
}

function mergeForecasts(forecasts: WeightedForecast[]): Forecast {
  const first = forecasts[0];
  if (!first) {
    throw new Error("At least one forecast is required for aggregation");
  }

  const rest = forecasts.slice(1);
  const forecastType = first.response.forecast.type;
  const domain = first.response.forecast.domain;
  const horizon = first.response.forecast.horizon;

  for (const entry of rest) {
    if (entry.response.forecast.type !== forecastType) {
      throw new Error("Cannot aggregate mixed forecast types");
    }

    if (entry.response.forecast.domain !== domain || entry.response.forecast.horizon !== horizon) {
      throw new Error("Cannot aggregate forecasts with different domains or horizons");
    }
  }

  switch (forecastType) {
    case "binary-probability":
      return mergeBinaryForecasts(forecasts as BinaryWeightedForecast[]);
    case "categorical-distribution":
      return mergeCategoricalForecasts(forecasts as CategoricalWeightedForecast[]);
    case "numeric-range":
      return mergeNumericRangeForecasts(forecasts as NumericRangeWeightedForecast[]);
  }
}

function mergeBinaryForecasts(forecasts: BinaryWeightedForecast[]): BinaryForecast {
  const totalWeight = forecasts.reduce((sum, entry) => sum + entry.weight, 0);
  const probability =
    forecasts.reduce(
      (sum, entry) => sum + entry.response.forecast.probability * entry.weight,
      0
    ) / totalWeight;
  const confidenceValues = forecasts
    .filter((entry) => entry.response.forecast.confidence != null)
    .map((entry) => ({
      confidence: entry.response.forecast.confidence as number,
      weight: entry.weight
    }));
  const confidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, entry) => sum + entry.confidence * entry.weight, 0) /
        totalWeight
      : undefined;

  const forecast: BinaryForecast = {
    type: "binary-probability",
    domain: forecasts[0]!.response.forecast.domain,
    horizon: forecasts[0]!.response.forecast.horizon,
    generatedAt: new Date().toISOString(),
    probability,
    rationale: "Aggregated from multiple OPP providers"
  };

  if (confidence != null) {
    forecast.confidence = confidence;
  }

  return forecast;
}

function mergeCategoricalForecasts(forecasts: CategoricalWeightedForecast[]): CategoricalForecast {
  const labels = new Set<string>();

  for (const entry of forecasts) {
    for (const item of entry.response.forecast.distribution) {
      labels.add(item.label);
    }
  }

  const totalWeight = forecasts.reduce((sum, entry) => sum + entry.weight, 0);
  const distribution = Array.from(labels)
    .map((label) => {
      const probability =
        forecasts.reduce((sum, entry) => {
          const item = entry.response.forecast.distribution.find(
            (candidate: { label: string; probability: number }) => candidate.label === label
          );
          return sum + (item?.probability ?? 0) * entry.weight;
        }, 0) / totalWeight;

      return { label, probability };
    })
    .sort((left, right) => right.probability - left.probability);

  return {
    type: "categorical-distribution",
    domain: forecasts[0]!.response.forecast.domain,
    horizon: forecasts[0]!.response.forecast.horizon,
    generatedAt: new Date().toISOString(),
    distribution,
    rationale: "Aggregated from multiple OPP providers"
  };
}

function mergeNumericRangeForecasts(forecasts: NumericRangeWeightedForecast[]): NumericRangeForecast {
  const units = forecasts[0]!.response.forecast.range.units;

  for (const entry of forecasts) {
    if (entry.response.forecast.range.units !== units) {
      throw new Error("Cannot aggregate numeric ranges with different units");
    }
  }

  const totalWeight = forecasts.reduce((sum, entry) => sum + entry.weight, 0);
  const range: NumericRangeForecast["range"] = {
    min:
      forecasts.reduce((sum, entry) => sum + entry.response.forecast.range.min * entry.weight, 0) /
      totalWeight,
    max:
      forecasts.reduce((sum, entry) => sum + entry.response.forecast.range.max * entry.weight, 0) /
      totalWeight
  };

  if (units != null) {
    range.units = units;
  }

  return {
    type: "numeric-range",
    domain: forecasts[0]!.response.forecast.domain,
    horizon: forecasts[0]!.response.forecast.horizon,
    generatedAt: new Date().toISOString(),
    range,
    rationale: "Aggregated from multiple OPP providers"
  };
}
