import type { PricingOption } from "../types/index.js";

export interface PaymentResolution {
  method: PricingOption["method"];
  authorized: boolean;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly method: PricingOption["method"];
  authorize(option: PricingOption): Promise<PaymentResolution> | PaymentResolution;
}

export interface NegotiatedPayment {
  option: PricingOption;
  provider: PaymentProvider;
}

export class FreePaymentProvider implements PaymentProvider {
  readonly method = "free" as const;

  authorize(option: PricingOption): PaymentResolution {
    if (option.method !== "free" || option.model !== "free") {
      throw new Error("FreePaymentProvider can only authorize free pricing options");
    }

    return {
      method: "free",
      authorized: true,
      metadata: {
        price: 0
      }
    };
  }
}

export interface X402PaymentProviderOptions {
  authorize: (
    option: PricingOption
  ) => Promise<PaymentResolution> | PaymentResolution;
}

export class X402PaymentProvider implements PaymentProvider {
  readonly method = "x402" as const;
  private readonly authorizeFn: X402PaymentProviderOptions["authorize"];

  constructor(options: X402PaymentProviderOptions) {
    this.authorizeFn = options.authorize;
  }

  authorize(option: PricingOption): Promise<PaymentResolution> | PaymentResolution {
    if (option.method !== "x402") {
      throw new Error("X402PaymentProvider can only authorize x402 pricing options");
    }

    return this.authorizeFn(option);
  }
}

export function findPricingOption(
  options: PricingOption[] | undefined,
  method: PricingOption["method"]
): PricingOption | undefined {
  return options?.find((option) => option.method === method);
}

export function negotiatePayment(
  options: PricingOption[] | undefined,
  providers: PaymentProvider[],
  preferredMethod?: PricingOption["method"]
): NegotiatedPayment | undefined {
  if (!options?.length) {
    return undefined;
  }

  if (preferredMethod) {
    const preferredOption = options.find((option) => option.method === preferredMethod);
    const preferredProvider = providers.find((provider) => provider.method === preferredMethod);

    if (preferredOption && preferredProvider) {
      return {
        option: preferredOption,
        provider: preferredProvider
      };
    }
  }

  for (const option of options) {
    const provider = providers.find((candidate) => candidate.method === option.method);
    if (provider) {
      return {
        option,
        provider
      };
    }
  }

  return undefined;
}

export * from "./negotiator.js";
