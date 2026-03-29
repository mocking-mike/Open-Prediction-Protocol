export type VerificationStatus = "self-reported" | "provisional" | "verified";
export type PaymentMethod = "free" | "x402" | "stripe" | "custom";
export type PaymentModel = "free" | "per-request" | "subscription" | "custom";
export type ForecastType = "binary-probability" | "categorical-distribution" | "numeric-range";

export interface AgentIdentity {
  id: string;
  did?: string;
}

export interface PredictionCapability {
  id: string;
  domain: string;
  title: string;
  description?: string;
  output: {
    type: ForecastType;
    units?: string;
  };
  horizons: string[];
}

export interface PricingOption {
  method: PaymentMethod;
  model: PaymentModel;
  currency?: string;
  amount?: number;
}

export interface DomainCalibration {
  domain: string;
  scoreType: "brier" | "log";
  score?: number;
  sampleSize: number;
  verificationStatus: VerificationStatus;
  verifiedBy?: string[];
  coverage?: {
    from?: string;
    to?: string;
  };
}

export interface AgentCard {
  protocolVersion: "0.1.0";
  name: string;
  description?: string;
  url: string;
  identity?: AgentIdentity;
  capabilities: {
    predictions: PredictionCapability[];
  };
  pricing?: {
    options: PricingOption[];
  };
  calibration?: {
    domains: DomainCalibration[];
  };
  compliance?: {
    riskLevel?: "minimal" | "limited" | "high" | "unknown";
    humanOversight?: boolean;
  };
}

export interface PredictionRequest {
  requestId: string;
  createdAt: string;
  consumer: AgentIdentity;
  prediction: {
    domain: string;
    question: string;
    horizon: string;
    desiredOutput: ForecastType;
    resolution?: string;
    context?: Record<string, unknown>;
  };
  constraints?: {
    maxLatencyMs?: number;
    maxPrice?: number;
    minVerificationStatus?: VerificationStatus;
    compliance?: {
      humanOversightRequired?: boolean;
    };
  };
  privacy?: {
    mode?: "plain" | "blinded";
  };
  payment?: {
    preferredMethod?: PaymentMethod;
  };
}

export interface BinaryForecast {
  type: "binary-probability";
  domain: string;
  horizon: string;
  generatedAt: string;
  probability: number;
  confidence?: number;
  rationale?: string;
}

export interface CategoricalForecast {
  type: "categorical-distribution";
  domain: string;
  horizon: string;
  generatedAt: string;
  distribution: Array<{
    label: string;
    probability: number;
  }>;
  rationale?: string;
}

export interface NumericRangeForecast {
  type: "numeric-range";
  domain: string;
  horizon: string;
  generatedAt: string;
  range: {
    min: number;
    max: number;
    units?: string;
  };
  rationale?: string;
}

export type Forecast = BinaryForecast | CategoricalForecast | NumericRangeForecast;

export interface PredictionResponseBase {
  responseId: string;
  requestId: string;
  createdAt: string;
  provider: AgentIdentity;
  freshness?: {
    timestamp?: string;
    nonce?: string;
    recipientDid?: string;
  };
  provenance?: {
    dependencyChain?: Array<{
      responseId: string;
      domain: string;
    }>;
  };
  signature?: {
    alg: string;
    value: string;
  };
  audit?: Record<string, unknown>;
}

export interface CompletedPredictionResponse extends PredictionResponseBase {
  status: "completed";
  forecast: Forecast;
}

export interface FailedPredictionResponse extends PredictionResponseBase {
  status: "failed";
  error: {
    code: string;
    message: string;
  };
}

export type PredictionResponse = CompletedPredictionResponse | FailedPredictionResponse;
