import type { PaymentProvider } from "./index.js";
import { negotiatePayment } from "./index.js";
import type { PricingOption } from "../types/index.js";

export interface PaymentNegotiatorOptions {
  pricingOptions?: PricingOption[];
  paymentProviders?: PaymentProvider[];
}

export class PaymentNegotiator {
  private readonly pricingOptions: PricingOption[];
  private readonly paymentProviders: PaymentProvider[];

  constructor(options: PaymentNegotiatorOptions) {
    this.pricingOptions = options.pricingOptions ?? [];
    this.paymentProviders = options.paymentProviders ?? [];
  }

  negotiate(preferredMethod?: PricingOption["method"]) {
    return negotiatePayment(this.pricingOptions, this.paymentProviders, preferredMethod);
  }
}
