export type PredictionPublicErrorCategory =
  | "handler"
  | "payment"
  | "rate_limit"
  | "validation"
  | "internal";

export type PredictionPublicErrorSurface = "prediction-response" | "json-rpc";

export interface PredictionPublicErrorEvent {
  error: unknown;
  surface: PredictionPublicErrorSurface;
  category: PredictionPublicErrorCategory;
  publicMessage: string;
  requestId?: string;
  providerId?: string;
  method?: string;
}

export interface PredictionPublicErrorOptions {
  exposeErrorDetails?: boolean;
  errorReporter?: (event: PredictionPublicErrorEvent) => void;
}

export function resolvePredictionPublicErrorMessage(
  error: unknown,
  category: PredictionPublicErrorCategory,
  exposeErrorDetails = false
): string {
  if (exposeErrorDetails) {
    return getErrorMessage(error, defaultPredictionPublicErrorMessage(category));
  }

  return defaultPredictionPublicErrorMessage(category);
}

export function reportPredictionPublicError(
  reporter: ((event: PredictionPublicErrorEvent) => void) | undefined,
  event: PredictionPublicErrorEvent
): void {
  if (!reporter) {
    return;
  }

  try {
    reporter(event);
  } catch {
    // Diagnostic hooks must not change protocol behavior.
  }
}

function defaultPredictionPublicErrorMessage(category: PredictionPublicErrorCategory): string {
  switch (category) {
    case "payment":
      return "Payment requirements not satisfied";
    case "rate_limit":
      return "Prediction request rate limited";
    case "validation":
      return "Request validation failed";
    case "handler":
    case "internal":
      return "Prediction request failed";
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
