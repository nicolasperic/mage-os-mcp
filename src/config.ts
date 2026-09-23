import "dotenv/config";
import type { TaxMode } from "./magento/price.js";

/**
 * Runtime configuration, sourced from environment variables.
 * See .env.example for the full list and defaults.
 */
export interface Config {
  baseUrl: string;
  graphqlEndpoint: string;
  storeCode: string;
  insecureTls: boolean;
  timeoutMs: number;
  /**
   * Whether this store's GraphQL prices include tax. Magento's storefront
   * GraphQL does not expose the tax display setting, so the deployment declares
   * it. Left unset we report "unknown" rather than guessing — an agent can act
   * on stated uncertainty, but not on a confident wrong answer.
   */
  taxMode: TaxMode;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function parseTaxMode(value: string | undefined): TaxMode {
  const v = value?.trim().toLowerCase();
  return v === "incl" || v === "excl" ? v : "unknown";
}

export function loadConfig(): Config {
  const baseUrl = requireEnv("MAGENTO_BASE_URL").replace(/\/+$/, "");
  return {
    baseUrl,
    graphqlEndpoint: `${baseUrl}/graphql`,
    storeCode: process.env.MAGENTO_STORE_CODE?.trim() || "default",
    insecureTls: process.env.MAGENTO_INSECURE_TLS?.trim() === "true",
    timeoutMs: Number(process.env.MAGENTO_TIMEOUT_MS) || 15000,
    taxMode: parseTaxMode(process.env.MAGENTO_TAX_MODE),
  };
}
