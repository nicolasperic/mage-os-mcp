import { GraphQLClient } from "graphql-request";
import { Agent, fetch as undiciFetch } from "undici";
import type { Config } from "../config.js";

/**
 * Thin wrapper around graphql-request configured for a Magento / Mage-OS
 * storefront GraphQL endpoint.
 *
 * - Sends the `Store` header so the correct store view is resolved.
 * - Optionally tolerates self-signed TLS certificates (local Warden/Docker),
 *   gated behind MAGENTO_INSECURE_TLS so it can never be enabled by accident
 *   against production.
 */
export function createGraphQLClient(config: Config): GraphQLClient {
  const insecureAgent = config.insecureTls
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

  // graphql-request expects a WHATWG-style fetch. We adapt undici's fetch so we
  // can attach a per-request dispatcher (for TLS) and an AbortSignal timeout.
  const customFetch: typeof fetch = (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    return undiciFetch(input as any, {
      ...(init as any),
      dispatcher: insecureAgent,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer)) as unknown as Promise<Response>;
  };

  return new GraphQLClient(config.graphqlEndpoint, {
    headers: {
      "Content-Type": "application/json",
      Store: config.storeCode,
    },
    fetch: customFetch,
  });
}
