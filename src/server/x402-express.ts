import {
  paymentMiddleware,
  paymentMiddlewareFromConfig,
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
  type SchemeRegistration
} from "@x402/express";

export type X402ExpressMiddleware = ReturnType<typeof paymentMiddleware>;
export type X402RoutesConfig = Parameters<typeof paymentMiddleware>[0];
export type X402ResourceServer = Parameters<typeof paymentMiddleware>[1];
export type X402PaywallConfig = Parameters<typeof paymentMiddleware>[2];
export type X402PaywallProvider = Parameters<typeof paymentMiddleware>[3];
export type X402SyncFacilitatorOnStart = Parameters<typeof paymentMiddleware>[4];
export type X402FacilitatorClients = Parameters<typeof paymentMiddlewareFromConfig>[1];
export type X402SchemeRegistrations = Parameters<typeof paymentMiddlewareFromConfig>[2];
export type X402HttpResourceServer = Parameters<typeof paymentMiddlewareFromHTTPServer>[0];

export {
  paymentMiddleware,
  paymentMiddlewareFromConfig,
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer
};

export type {
  SchemeRegistration
};

export interface CreateX402ExpressMiddlewareOptions {
  routes: X402RoutesConfig;
  server?: X402ResourceServer;
  facilitatorClients?: X402FacilitatorClients;
  schemes?: X402SchemeRegistrations;
  paywallConfig?: X402PaywallConfig;
  paywall?: X402PaywallProvider;
  syncFacilitatorOnStart?: X402SyncFacilitatorOnStart;
}

export function createX402ExpressMiddleware(
  options: CreateX402ExpressMiddlewareOptions
): X402ExpressMiddleware {
  if (options.server) {
    return paymentMiddleware(
      options.routes,
      options.server,
      options.paywallConfig,
      options.paywall,
      options.syncFacilitatorOnStart
    );
  }

  return paymentMiddlewareFromConfig(
    options.routes,
    options.facilitatorClients,
    options.schemes,
    options.paywallConfig,
    options.paywall,
    options.syncFacilitatorOnStart
  );
}

export interface CreateX402ExpressMiddlewareFromHttpServerOptions {
  httpServer: X402HttpResourceServer;
  paywallConfig?: X402PaywallConfig;
  paywall?: X402PaywallProvider;
  syncFacilitatorOnStart?: X402SyncFacilitatorOnStart;
}

export function createX402ExpressMiddlewareFromHttpServer(
  options: CreateX402ExpressMiddlewareFromHttpServerOptions
): X402ExpressMiddleware {
  return paymentMiddlewareFromHTTPServer(
    options.httpServer,
    options.paywallConfig,
    options.paywall,
    options.syncFacilitatorOnStart
  );
}
